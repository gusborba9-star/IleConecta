-- 0155 — Saúde da plataforma: registro de erros e falhas técnicas, painel do dono e alertas no sino.
-- Fase 6 (observabilidade, 17/11/2026). Até aqui nada registrava erros do app, falhas da IA ou das funções do servidor, e ninguém era avisado
-- se uma rotina agendada parasse. Agora:
--  * system_events: erros do app (sem identificar a pessoa), falhas de IA e erros das funções do servidor; guardados por 30 dias.
--  * report_client_error(): o app (logado) relata um erro; texto limpo de e-mails, ids e números longos; limite por pessoa e limite geral por hora.
--  * log_system_event(): as funções do servidor registram falhas (só a chave de serviço).
--  * admin_health(): o painel do dono vê contagens, erros mais frequentes, estado de cada rotina agendada e do banco.
--  * health_check(): a cada 10 minutos confere os sinais e manda um aviso no sino do dono (que também vira push), no máximo um por problema a cada 6 h.
-- Pode rodar de novo sem problema.

create table if not exists public.system_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('erro_app', 'ia_falha', 'funcao_erro')),
  source text not null check (char_length(source) between 1 and 60),
  route text check (route is null or char_length(route) <= 120),
  detail text not null check (char_length(detail) <= 400)
);
create index if not exists system_events_kind_at_idx on public.system_events (kind, at desc);
create index if not exists system_events_at_idx on public.system_events (at);
alter table public.system_events enable row level security;
revoke all on public.system_events from public, anon, authenticated;

-- contador por pessoa e hora só para limitar abuso; não vai para o registro de erros (que não identifica ninguém) e some em 3 horas
create table if not exists public.client_error_throttle (
  user_id uuid not null,
  bucket timestamptz not null,
  n int not null default 0,
  primary key (user_id, bucket)
);
alter table public.client_error_throttle enable row level security;
revoke all on public.client_error_throttle from public, anon, authenticated;

create table if not exists public.health_alerts (
  code text primary key,
  last_sent timestamptz not null default now()
);
alter table public.health_alerts enable row level security;
revoke all on public.health_alerts from public, anon, authenticated;

-- Limpa um texto de erro antes de guardar: sem e-mails, ids, endereços de rede, números longos nem caracteres de controle; tamanho limitado.
create or replace function public.system_text_clean(p_text text, p_max int) returns text
language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(p_text, ''),
    '[[:cntrl:]]+', ' ', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[e-mail]', 'g'),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
    '[0-9]{5,}', '#', 'g'),
    '\s+', ' ', 'g')), greatest(p_max, 1));
$$;

-- Endereço da tela sem consulta, sem #, com ids trocados por :id.
create or replace function public.system_route_clean(p_route text) returns text
language sql immutable set search_path = public as $$
  select left(regexp_replace(regexp_replace(regexp_replace(
    split_part(split_part(coalesce(p_route, ''), '?', 1), '#', 1),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
    '/[0-9]+(/|$)', '/:id\1', 'g'),
    '[[:cntrl:]]+', '', 'g'), 120);
$$;

-- O app (com a pessoa logada) relata um erro. Devolve false quando passou do limite (nada é gravado).
create or replace function public.report_client_error(p_route text, p_message text, p_source text default 'app') returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int; v_msg text; v_src text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  v_msg := public.system_text_clean(p_message, 400);
  if char_length(v_msg) < 2 then return false; end if;
  v_src := public.system_text_clean(coalesce(nullif(p_source, ''), 'app'), 60);
  insert into public.client_error_throttle (user_id, bucket, n) values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id, bucket) do update set n = public.client_error_throttle.n + 1 returning n into v_n;
  if v_n > 20 then return false; end if;
  -- trava geral: uma enxurrada (de contas diferentes) não enche o registro
  if (select count(*) from public.system_events where kind = 'erro_app' and at > now() - interval '1 hour') >= 600 then return false; end if;
  insert into public.system_events (kind, source, route, detail) values ('erro_app', v_src, nullif(public.system_route_clean(p_route), ''), v_msg);
  return true;
end $$;

-- As funções do servidor registram uma falha (só a chave de serviço).
create or replace function public.log_system_event(p_kind text, p_source text, p_detail text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_kind not in ('ia_falha', 'funcao_erro') then raise exception 'Tipo inválido.'; end if;
  if (select count(*) from public.system_events where kind = p_kind and at > now() - interval '1 hour') >= 1000 then return false; end if;
  insert into public.system_events (kind, source, detail)
  values (p_kind, coalesce(nullif(public.system_text_clean(p_source, 60), ''), 'servidor'), coalesce(nullif(public.system_text_clean(p_detail, 400), ''), '(sem detalhe)'));
  return true;
end $$;

-- Estado das rotinas agendadas (pg_cron). Lê por SQL dinâmico para funcionar também onde a extensão não existe.
create or replace function public.health_cron() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then return r; end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last_run', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
      'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
      'runs_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
      'failed_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status <> 'succeeded'),
      'failed_30min', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '30 minutes' and d.status <> 'succeeded')
    ) order by j.jobname), '[]'::jsonb) from cron.job j $q$ into r;
  return r;
end $$;

-- Painel do dono: tudo que mostra se a plataforma está saudável.
create or replace function public.admin_health() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_kinds text[] := array['erro_app', 'ia_falha', 'funcao_erro']; k text; h1 jsonb := '{}'; h24 jsonb := '{}';
begin
  if not public.admin_can('dono') then raise exception 'Área restrita ao dono da plataforma.' using errcode = '42501'; end if;
  foreach k in array v_kinds loop
    h1 := h1 || jsonb_build_object(k, (select count(*) from public.system_events where kind = k and at > now() - interval '1 hour'));
    h24 := h24 || jsonb_build_object(k, (select count(*) from public.system_events where kind = k and at > now() - interval '24 hours'));
  end loop;
  return jsonb_build_object(
    'generated_at', now(),
    'last_hour', h1,
    'last_24h', h24,
    'top', (select coalesce(jsonb_agg(t order by (t->>'n')::int desc, t->>'last_at' desc), '[]'::jsonb) from (
      select jsonb_build_object('kind', kind, 'source', source, 'route', route, 'detail', detail, 'n', count(*), 'first_at', min(at), 'last_at', max(at)) t
        from public.system_events where at > now() - interval '24 hours' group by kind, source, route, detail
        order by count(*) desc, max(at) desc limit 8) x),
    'cron', public.health_cron(),
    'db', jsonb_build_object('size_bytes', pg_database_size(current_database()), 'connections', (select count(*) from pg_stat_activity where datname = current_database())),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'since', last_sent) order by last_sent desc), '[]'::jsonb) from public.health_alerts)
  );
end $$;

-- Confere os sinais e avisa o dono no sino (e no push). Um aviso por problema a cada 6 h; quando o problema some, o próximo avisa na hora.
create or replace function public.health_check() returns integer
language plpgsql security definer set search_path = public as $$
declare v_sent int := 0; v_open text[] := '{}'; rec record; v_n int; v_code text;
begin
  -- 1) rotina agendada que falhou nos últimos 30 minutos ou parou (as de hora em hora ou mais frequentes, sem execução há mais de 2 h)
  for rec in select * from jsonb_to_recordset(public.health_cron()) as x(name text, schedule text, active boolean, last_run timestamptz, failed_30min int) loop
    if rec.failed_30min > 0 then
      v_code := 'cron_falhou:' || rec.name; v_open := v_open || v_code;
      perform public.health_notify(v_code, 'Alerta técnico: a rotina agendada "' || rec.name || '" falhou. Veja em Administração > Visão geral > Saúde da plataforma.');
    elsif rec.active and rec.last_run is not null and rec.last_run < now() - interval '2 hours' and rec.schedule ~ '^(\*|\*/[0-9]+|[0-9]+) (\*|\*/[0-9]+) \* \* \*$' then
      v_code := 'cron_parou:' || rec.name; v_open := v_open || v_code;
      perform public.health_notify(v_code, 'Alerta técnico: a rotina agendada "' || rec.name || '" não roda há mais de 2 horas. Veja em Administração > Visão geral > Saúde da plataforma.');
    end if;
  end loop;
  -- 2) picos recentes de erros
  for rec in select * from (values
      ('erro_app', 15, 'erros no app'), ('ia_falha', 5, 'falhas da assistente de IA'), ('funcao_erro', 3, 'erros em funções do servidor')) as t(kind, lim, label) loop
    select count(*) into v_n from public.system_events where kind = rec.kind and at > now() - interval '15 minutes';
    if v_n >= rec.lim then
      v_code := 'pico:' || rec.kind; v_open := v_open || v_code;
      perform public.health_notify(v_code, 'Alerta técnico: ' || v_n || ' ' || rec.label || ' nos últimos 15 minutos. Veja em Administração > Visão geral > Saúde da plataforma.');
    end if;
  end loop;
  -- 3) problema que sumiu: libera o aviso para a próxima vez
  delete from public.health_alerts where code <> all (v_open);
  select count(*) into v_sent from public.health_alerts where last_sent > now() - interval '1 minute';
  return v_sent;
end $$;

create or replace function public.health_notify(p_code text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  select last_sent into v_last from public.health_alerts where code = p_code for update;
  if found and v_last > now() - interval '6 hours' then return; end if;
  insert into public.health_alerts (code, last_sent) values (p_code, now()) on conflict (code) do update set last_sent = now();
  insert into public.notifications (user_id, text, href) select a.user_id, left(p_text, 300), '/admin' from public.admins a where a.is_owner;
end $$;

create or replace function public.purge_system_events() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.system_events where at < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.client_error_throttle where bucket < now() - interval '3 hours';
  -- o pg_cron guarda o histórico de execuções para sempre; só os últimos 7 dias interessam
  if to_regclass('cron.job_run_details') is not null then execute $q$delete from cron.job_run_details where start_time < now() - interval '7 days'$q$; end if;
  return n;
end $$;

revoke all on function public.system_text_clean(text, int), public.system_route_clean(text), public.report_client_error(text, text, text), public.log_system_event(text, text, text),
  public.health_cron(), public.admin_health(), public.health_check(), public.health_notify(text, text), public.purge_system_events() from public, anon, authenticated;
grant execute on function public.report_client_error(text, text, text), public.admin_health() to authenticated;
grant execute on function public.log_system_event(text, text, text), public.health_check(), public.purge_system_events() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('health-check', '*/10 * * * *', 'select public.health_check()');
    perform cron.schedule('purge-system-events', '55 3 * * *', 'select public.purge_system_events()');
  end if;
end $$;

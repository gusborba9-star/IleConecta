-- 0157 — Saúde da plataforma: "Rodar agora" nas rotinas e "Já vi" nos alertas (só o dono).
-- Pedido do proprietário (17/11/2026): em produção, quando uma rotina falhar por oscilação (Stripe, Supabase, rede), ele precisa de uma ação rápida.
--  * admin_run_routine(nome): roda UMA rotina da lista segura, exatamente com o comando que o agendador usa (lido do cron.job; nada vem do texto
--    de quem chama, só o nome, que precisa estar na lista). Só o dono. Uma vez por minuto por rotina e no máximo 60 por hora. Tudo registrado.
--    Ficam de fora de propósito: as limpezas de dados (purge-*) e a exclusão de contas (não se apaga nada fora de hora).
--    Todas as da lista já são repetíveis sem efeito duplicado (cobrança: uma fatura por período; avisos: marca de "já avisado"; reembolso/vagas: por estado).
--  * admin_ack_alert(codigo): "Já vi" — marca o alerta como visto sem apagar; volta a ficar "novo" se o aviso for reenviado.
-- Pode rodar de novo sem problema.

create table if not exists public.routine_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  routine text not null check (char_length(routine) between 1 and 80),
  ok boolean not null,
  note text check (note is null or char_length(note) <= 200)
);

create index if not exists routine_runs_at_idx on public.routine_runs (at);

create index if not exists routine_runs_routine_idx on public.routine_runs (routine, at desc);

alter table public.routine_runs enable row level security;

revoke all on public.routine_runs from public, anon, authenticated;

alter table public.health_alerts add column if not exists seen_at timestamptz;

-- Rotinas que o dono pode rodar à mão (todas repetíveis sem efeito duplicado).
create or replace function public.health_runnable() returns text[]
language sql immutable set search_path = public as $$
  select array['expire-stale-holds', 'handoff-remind', 'promotions-tick', 'member-dues-daily', 'plan-trial-revert', 'platform-billing-tick',
               'platform-billing-sweep', 'platform-cancel-apply', 'platform-price-apply', 'refund-sweep', 'health-check']::text[];
$$;

create or replace function public.admin_run_routine(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cmd text; v_note text;
begin
  if not public.admin_can('dono') then raise exception 'Área restrita ao dono da plataforma.' using errcode = '42501'; end if;
  if p_name is null or not (p_name = any (public.health_runnable())) then raise exception 'Esta rotina não pode ser executada à mão.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin_run_routine', 0));
  if exists (select 1 from public.routine_runs where routine = p_name and at > now() - interval '1 minute') then
    raise exception 'Esta rotina acabou de rodar. Espere um minuto.' using errcode = '22023';
  end if;
  if (select count(*) from public.routine_runs where at > now() - interval '1 hour') >= 60 then
    raise exception 'Muitas execuções manuais na última hora. Tente mais tarde.' using errcode = '22023';
  end if;
  if to_regclass('cron.job') is null then raise exception 'O agendador não está disponível neste ambiente.' using errcode = '22023'; end if;
  execute 'select command from cron.job where jobname = $1' into v_cmd using p_name;
  if v_cmd is null then raise exception 'Rotina não encontrada no agendador.' using errcode = '22023'; end if;
  begin
    execute v_cmd;
  exception when others then
    v_note := public.system_text_clean(sqlerrm, 200);
    insert into public.routine_runs (routine, ok, note) values (p_name, false, v_note);
    return jsonb_build_object('ok', false, 'message', v_note);
  end;
  insert into public.routine_runs (routine, ok) values (p_name, true);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_ack_alert(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'Área restrita ao dono da plataforma.' using errcode = '42501'; end if;
  update public.health_alerts set seen_at = now() where code = p_code and seen_at is null;
  return found;
end $$;

-- Painel: cada rotina diz se pode ser rodada à mão e como foi a última execução manual; cada alerta diz se já foi visto.
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
      'failed_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'failed'),
      'failed_30min', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '30 minutes' and d.status = 'failed'),
      'can_run', j.jobname = any (public.health_runnable())
    ) order by j.jobname), '[]'::jsonb) from cron.job j $q$ into r;
  return r;
end $$;

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
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'since', last_sent, 'seen_at', seen_at) order by last_sent desc), '[]'::jsonb) from public.health_alerts),
    'manual_runs', (select coalesce(jsonb_agg(jsonb_build_object('routine', routine, 'at', at, 'ok', ok, 'note', note) order by at desc), '[]'::jsonb)
                      from (select * from public.routine_runs order by at desc limit 5) z)
  );
end $$;

-- Reenviar um aviso (problema que continua passadas 6 h) volta o alerta para "novo".
create or replace function public.health_notify(p_code text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  select last_sent into v_last from public.health_alerts where code = p_code for update;
  if found and v_last > now() - interval '6 hours' then return; end if;
  insert into public.health_alerts (code, last_sent, seen_at) values (p_code, now(), null) on conflict (code) do update set last_sent = now(), seen_at = null;
  insert into public.notifications (user_id, text, href) select a.user_id, left(p_text, 300), '/admin' from public.admins a where a.is_owner;
end $$;

create or replace function public.purge_system_events() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.system_events where at < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.client_error_throttle where bucket < now() - interval '3 hours';
  delete from public.routine_runs where at < now() - interval '30 days';
  -- o pg_cron guarda o histórico de execuções para sempre; só os últimos 7 dias interessam
  if to_regclass('cron.job_run_details') is not null then execute $q$delete from cron.job_run_details where start_time < now() - interval '7 days'$q$; end if;
  return n;
end $$;

revoke all on function public.health_runnable(), public.admin_run_routine(text), public.admin_ack_alert(text), public.health_cron(), public.admin_health(),
  public.health_notify(text, text), public.purge_system_events() from public, anon, authenticated;
grant execute on function public.admin_run_routine(text), public.admin_ack_alert(text), public.admin_health() to authenticated;
grant execute on function public.purge_system_events() to service_role;

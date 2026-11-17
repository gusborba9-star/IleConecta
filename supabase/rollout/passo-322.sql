-- PASSO 322: 0155_saude_da_plataforma_e_alertas — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

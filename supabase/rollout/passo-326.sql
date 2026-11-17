-- PASSO 326: 0157_saude_rodar_rotina_e_marcar_visto — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

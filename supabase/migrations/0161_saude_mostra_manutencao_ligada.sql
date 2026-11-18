-- 0161 — Saúde da plataforma passa a mostrar o interruptor de emergência: linha no card enquanto houver manutenção ligada e alerta + aviso no sino
-- se ela ficar ligada por mais de 1 hora (para não esquecer ligada). Reaproveita os alertas existentes (health_alerts / health_notify, reenvio só após 6 h).
create or replace function public.health_check() returns integer
language plpgsql security definer set search_path = public as $$
declare v_sent int := 0; v_open text[] := '{}'; rec record; v_n int; v_code text; v_maint jsonb;
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
  -- 2b) manutenção (interruptor de emergência) ligada há mais de 1 hora: lembra o dono de desligar (o aviso não se repete antes de 6 h)
  select value into v_maint from public.platform_settings where key = 'maintenance';
  if (coalesce(v_maint ->> 'assistant', 'false') = 'true' or coalesce(v_maint ->> 'payments', 'false') = 'true')
     and coalesce(case when v_maint ->> 'since' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' then (v_maint ->> 'since')::timestamptz end, now()) < now() - interval '1 hour' then
    v_code := 'manutencao_ligada'; v_open := v_open || v_code;
    perform public.health_notify(v_code, 'Alerta técnico: a manutenção está ligada há ' || greatest(1, floor(extract(epoch from (now() - (v_maint ->> 'since')::timestamptz)) / 3600))::int
      || ' hora(s) (' || concat_ws(' e ', case when v_maint ->> 'assistant' = 'true' then 'assistente' end, case when v_maint ->> 'payments' = 'true' then 'pagamentos' end)
      || '). Se já resolveu, desligue em Administração > Visão geral > Interruptor de emergência.');
  end if;
  -- 3) problema que sumiu: libera o aviso para a próxima vez
  delete from public.health_alerts where code <> all (v_open);
  select count(*) into v_sent from public.health_alerts where last_sent > now() - interval '1 minute';
  return v_sent;
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
    'maintenance', coalesce((select jsonb_build_object('assistant', coalesce(value ->> 'assistant', 'false') = 'true', 'payments', coalesce(value ->> 'payments', 'false') = 'true', 'since', value ->> 'since') from public.platform_settings where key = 'maintenance'), jsonb_build_object('assistant', false, 'payments', false, 'since', null)),
    'cron', public.health_cron(),
    'db', jsonb_build_object('size_bytes', pg_database_size(current_database()), 'connections', (select count(*) from pg_stat_activity where datname = current_database())),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'since', last_sent, 'seen_at', seen_at) order by last_sent desc), '[]'::jsonb) from public.health_alerts),
    'manual_runs', (select coalesce(jsonb_agg(jsonb_build_object('routine', routine, 'at', at, 'ok', ok, 'note', note) order by at desc), '[]'::jsonb)
                      from (select * from public.routine_runs order by at desc limit 5) z)
  );
end $$;

revoke all on function public.admin_health(), public.health_check() from public, anon, authenticated;
grant execute on function public.admin_health() to authenticated;
grant execute on function public.health_check() to service_role;

-- PASSO 101: 0091_creditos_de_ia — parte 3 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) compra avulsa não conta para atraso, aviso nem suspensão ============
create or replace function public.platform_house_billing_recompute(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); late boolean; fully boolean; proc boolean; susp boolean; tot boolean; was boolean; wast boolean;
begin
if not exists (select 1 from public.houses where id = p_house) then return false; end if;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) < d) into late;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) + tdays < d) into fully;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status = 'em_processamento') into proc;
susp := coalesce((cfg ->> 'enabled')::boolean, false) and late and not proc;
tot := susp and fully;
select suspended, total into was, wast from public.house_billing_state where house_id = p_house;
if was is distinct from susp or wast is distinct from tot then
if susp or was is not null then
insert into public.house_billing_state (house_id, suspended, since, total, total_since, updated_at) values (p_house, susp, case when susp then p_now end, tot, case when tot then p_now end, now())
on conflict (house_id) do update set suspended = excluded.suspended, total = excluded.total,
since = case when excluded.suspended and house_billing_state.suspended then house_billing_state.since else excluded.since end,
total_since = case when excluded.total and house_billing_state.total then house_billing_state.total_since else excluded.total_since end,
updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason)
values ('sistema', gen_random_uuid()::text, case when tot and not coalesce(wast, false) then 'casa_bloqueio_total' when susp and not coalesce(was, false) then 'casa_suspensa' when susp then 'casa_volta_parcial' else 'casa_reativada' end, 'processado', p_house::text);
end if;
end if;
return susp;
end $$;

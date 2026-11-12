-- PASSO 84: 0088_cobranca_motor — parte 9 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 9) suspensão parcial: tolerância em dias úteis; nunca suspende com pagamento em processamento ============
create or replace function public.platform_house_billing_recompute(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; late boolean; proc boolean; susp boolean; was boolean;
begin
if not exists (select 1 from public.houses where id = p_house) then return false; end if;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) < d) into late;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.status = 'em_processamento') into proc;
susp := coalesce((cfg ->> 'enabled')::boolean, false) and late and not proc;
select suspended into was from public.house_billing_state where house_id = p_house;
if was is distinct from susp and (susp or was is not null) then
insert into public.house_billing_state (house_id, suspended, since, updated_at) values (p_house, susp, case when susp then p_now end, now())
on conflict (house_id) do update set suspended = excluded.suspended, since = excluded.since, updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason)
values ('sistema', gen_random_uuid()::text, case when susp then 'casa_suspensa' else 'casa_reativada' end, 'processado', p_house::text);
end if;
return susp;
end $$;

create or replace function public.house_billing_blocked(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) and coalesce((select s.suspended from public.house_billing_state s where s.house_id = h), false);
$$;

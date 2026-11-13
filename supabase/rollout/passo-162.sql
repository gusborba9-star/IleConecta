-- PASSO 162: 0099_reativacao_por_pagamento — parte 4 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) fatura de reativação paga: a casa volta e é matriculada de novo (uma vez; repetir não duplica) ============
create or replace function public.platform_house_reactivated_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date := (coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo')::date; v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'reativacao:%' then return new; end if;
update public.house_billing_state set cancelled_at = null, updated_at = now() where house_id = new.house_id and cancelled_at is not null;
if not found then return new; end if;
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (new.house_id, least(extract(day from v_day)::int, 28), v_day, true)
on conflict (house_id) do update set active = true, billing_day = excluded.billing_day, started_on = excluded.started_on, updated_at = now();
perform public.platform_house_billing_recompute(new.house_id);
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'casa_reativada_pagamento', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: sua casa foi reativada e a cobrança mensal do plano voltou a valer. A cobrança automática no cartão fica desligada até você ligar de novo em Planos.', '/planos');
end if;
return new;
end $$;

drop trigger if exists trg_platform_house_reactivated on public.platform_charges;

create trigger trg_platform_house_reactivated after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_house_reactivated_by_payment();

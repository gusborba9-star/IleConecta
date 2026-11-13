-- PASSO 149: 0098_reembolso_plano_7_dias — parte 3 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.house_billing_level(h uuid) returns text
language sql stable security definer set search_path = public as $$
select case when not coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) then 'ok'
when coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false) then 'total'
when coalesce((select s.total from public.house_billing_state s where s.house_id = h), false) then 'total'
when coalesce((select s.suspended from public.house_billing_state s where s.house_id = h), false) then 'parcial'
else 'ok' end;
$$;

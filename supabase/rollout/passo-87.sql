-- PASSO 87: 0088_cobranca_motor — parte 12 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- nível da casa: 'ok', 'parcial' (sem venda nova, campanha, destaque, impulsionamento e assistente) ou 'total' (fora da descoberta e do feed; painel só leitura)
create or replace function public.house_billing_level(h uuid) returns text
language sql stable security definer set search_path = public as $$
select case when not coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) then 'ok'
when coalesce((select s.total from public.house_billing_state s where s.house_id = h), false) then 'total'
when coalesce((select s.suspended from public.house_billing_state s where s.house_id = h), false) then 'parcial'
else 'ok' end;
$$;

-- PASSO 119: 0094_cobranca_automatica_cartao — parte 5 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) cadastro, troca, liga/desliga e remoção do cartão (chamados só pela função do servidor, que confere a dona) ============
create or replace function public.platform_card_customer(p_house uuid, p_provider text, p_customer text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
insert into public.house_card_on_file (house_id, provider, customer_ref) values (p_house, p_provider, p_customer)
on conflict (house_id) do nothing;
select customer_ref into v from public.house_card_on_file where house_id = p_house and provider = p_provider;
if v is null then raise exception 'A casa já tem cliente em outro provedor.'; end if;
return v;
end $$;

create or replace function public.platform_card_setup_open(p_house uuid, p_provider text, p_ref text) returns void
language sql security definer set search_path = public as $$
insert into public.house_card_setups (ref, house_id, provider) values (p_ref, p_house, p_provider) on conflict (ref) do nothing;
$$;

-- PASSO 120: 0094_cobranca_automatica_cartao — parte 6 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- grava o cartão (a primeira vez ou a troca) e liga a cobrança automática; vale para faturas que vencem a partir de hoje
create or replace function public.platform_card_save(p_house uuid, p_provider text, p_setup_ref text, p_customer text, p_method text, p_brand text, p_last4 text, p_month int, p_year int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.house_card_setups; v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_old text;
begin
select * into s from public.house_card_setups where ref = p_setup_ref and house_id = p_house and provider = p_provider for update;
if not found then raise exception 'Cadastro de cartão desconhecido.'; end if;
if s.done then return jsonb_build_object('already', true); end if;
select method_ref into v_old from public.house_card_on_file where house_id = p_house;
update public.house_card_on_file set method_ref = p_method, brand = left(p_brand, 30), last4 = p_last4, exp_month = p_month, exp_year = p_year,
auto_enabled = true, saved_on = v_today, updated_at = now()
where house_id = p_house and provider = p_provider and customer_ref = p_customer;
if not found then raise exception 'Cliente do cartão não confere.'; end if;
update public.house_card_setups set done = true where ref = p_setup_ref;
return jsonb_build_object('already', false, 'previous_method', v_old);
end $$;

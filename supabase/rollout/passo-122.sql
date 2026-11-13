-- PASSO 122: 0094_cobranca_automatica_cartao — parte 8 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- o servidor precisa do cartão para cobrar e para a tela de remoção
create or replace function public.platform_card_get(p_house uuid) returns jsonb
language sql stable security definer set search_path = public as $$
select coalesce((select jsonb_build_object('provider', provider, 'customer', customer_ref, 'method', method_ref, 'brand', brand, 'last4', last4, 'auto_enabled', auto_enabled) from public.house_card_on_file where house_id = p_house), 'null'::jsonb);
$$;

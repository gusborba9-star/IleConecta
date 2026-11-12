-- PASSO 97: 0089_cobranca_tentativas_e_card — parte 6 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) permissões ============
revoke all on function public.platform_charge_of_ref(text, text), public.platform_charge_record_fee(text, text, bigint), public.my_house_billing_status(uuid) from public, anon, authenticated;

grant execute on function public.platform_charge_of_ref(text, text), public.platform_charge_record_fee(text, text, bigint) to service_role;

grant execute on function public.my_house_billing_status(uuid) to authenticated, service_role;

revoke all on public.platform_charge_refs from anon, authenticated;

grant select on public.platform_charge_refs to authenticated;

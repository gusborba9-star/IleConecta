-- PASSO 180: 0101_cancelamento_e_tela_unica — parte 6 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) o que a própria casa vê e faz ============
create or replace function public.my_cancel_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'can_cancel', false); end if;
select * into st from public.house_billing_state where house_id = h;
v_reason := public.platform_cancel_block_reason(h, d);
return jsonb_build_object('has_house', true,
'scheduled', st.cancel_at is not null and st.cancelled_at is null, 'cancel_at', case when st.cancelled_at is null then st.cancel_at end,
'can_cancel', v_reason is null and not coalesce(st.cancel_at is not null, false), 'reason', case when st.cancel_at is not null and st.cancelled_at is null then null else v_reason end,
'next_renewal', public.platform_house_next_renewal(h, d));
end $$;

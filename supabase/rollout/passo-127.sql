-- PASSO 127: 0094_cobranca_automatica_cartao — parte 13 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) situação do cartão para a tela da casa (nunca devolve referência do provedor) ============
create or replace function public.my_card_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; f public.house_card_on_file;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
select * into f from public.house_card_on_file where house_id = h;
return jsonb_build_object('has_house', true, 'available', public.billing_auto_card_enabled(), 'has_card', f.method_ref is not null,
'brand', f.brand, 'last4', f.last4, 'exp_month', f.exp_month, 'exp_year', f.exp_year, 'auto_enabled', coalesce(f.auto_enabled, false),
'max_attempts', public.billing_auto_max_attempts(),
'last_attempt', (select jsonb_build_object('attempt', t.attempt, 'outcome', t.outcome, 'at', t.updated_at, 'due_date', c.due_date, 'amount_cents', c.amount_cents)
from public.platform_auto_attempts t join public.platform_charges c on c.id = t.charge_id where c.house_id = h order by t.updated_at desc limit 1));
end $$;

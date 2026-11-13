-- PASSO 138: 0095_reembolso_creditos_7_dias — parte 10 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) tela da casa: o que pode ser reembolsado agora, com o valor ============
create or replace function public.my_credit_refunds() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'items', '[]'::jsonb, 'history', '[]'::jsonb, 'window_days', 7); end if;
return jsonb_build_object('has_house', true, 'window_days', 7,
'items', coalesce((select jsonb_agg(jsonb_build_object('charge_id', c.id, 'size', p.size, 'remaining', p.remaining, 'paid_cents', c.paid_amount_cents,
'refund_cents', public.platform_credit_refund_cents(c.paid_amount_cents, p.remaining, p.size), 'deadline', c.paid_at + interval '7 days') order by c.paid_at)
from public.platform_charges c join public.ai_credit_packs p on p.charge_id = c.id
where c.house_id = h and c.kind = 'credit_pack' and c.status = 'paga' and c.paid_at + interval '7 days' >= now() and p.remaining > 0 and p.expires_at > now()
and not exists (select 1 from public.platform_credit_refunds r where r.charge_id = c.id and r.status in ('pendente', 'concluido'))), '[]'::jsonb),
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'credits', r.credits, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_credit_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 10) r), '[]'::jsonb));
end $$;

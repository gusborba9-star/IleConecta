-- PASSO 5 de 18: 0064 e: valores registrados do estorno
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ 5) estorno pelo que foi REGISTRADO ============
-- Valores efetivamente lançados no ledger da transação (líquidos de estornos anteriores) e a regra de comissão original.
-- Sem lançamentos, usa fee_cents gravado na própria transação; sem nenhum dos dois, falha — nunca recalcula pela regra atual.
create or replace function public.payment_recorded_amounts(p_payment uuid)
returns table (gross bigint, fee bigint, net bigint, version text)
language plpgsql stable security definer set search_path = public as $$
declare g bigint; f bigint; c bigint; v text; n integer; pay public.payments%rowtype;
begin
  select count(*),
         sum(amount_cents) filter (where entry_type = 'bruto'),
         sum(amount_cents) filter (where entry_type = 'plataforma'),
         sum(amount_cents) filter (where entry_type = 'casa'),
         (array_agg(fee_rule_version order by created_at) filter (where entry_type = 'bruto' and amount_cents > 0))[1]
    into n, g, f, c, v
    from public.ledger_entries where payment_id = p_payment and entry_type in ('bruto', 'plataforma', 'casa');
  select * into pay from public.payments where id = p_payment;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if n = 0 or g is null then
    if pay.fee_cents is null then raise exception 'Comissão registrada não encontrada para o estorno.'; end if;
    return query select pay.gross_cents, pay.fee_cents, pay.gross_cents - pay.fee_cents, pay.fee_rule_version;
    return;
  end if;
  if g <= 0 or coalesce(f, 0) < 0 or coalesce(c, 0) < 0 or g - coalesce(f, 0) <> coalesce(c, 0) then
    raise exception 'Lançamentos do pagamento inconsistentes para o estorno.';
  end if;
  return query select g, coalesce(f, 0), c, coalesce(v, pay.fee_rule_version);
end $$;

-- FIM DO PASSO 5

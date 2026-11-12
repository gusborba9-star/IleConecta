-- PASSO 93: 0089_cobranca_tentativas_e_card — parte 2 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) fatura: a referência só muda enquanto não há pagamento em andamento; pagamento e tarifa, depois de gravados, não mudam ============
create or replace function public.platform_charges_guard() returns trigger
language plpgsql set search_path = public as $$
declare ok boolean;
begin
if tg_op = 'DELETE' then raise exception 'Fatura não pode ser apagada; cancele-a.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.kind is distinct from old.kind or new.item_key is distinct from old.item_key
or new.amount_cents is distinct from old.amount_cents or new.due_date is distinct from old.due_date or new.period_start is distinct from old.period_start
or new.idempotency_key is distinct from old.idempotency_key or new.ref_id is distinct from old.ref_id or new.created_at is distinct from old.created_at then
raise exception 'Valor, vencimento, casa e produto da fatura não podem ser alterados.';
end if;
if old.provider_ref is not null and old.status not in ('aberta','vencida') and (new.provider_ref is distinct from old.provider_ref or new.provider is distinct from old.provider) then
raise exception 'A referência do provedor já foi definida e não pode mudar.';
end if;
if old.paid_ref is not null and new.paid_ref is distinct from old.paid_ref then raise exception 'A referência do pagamento não pode mudar.'; end if;
if old.paid_at is not null and (new.paid_at is distinct from old.paid_at or new.paid_amount_cents is distinct from old.paid_amount_cents) then
raise exception 'Data e valor pagos não podem mudar.';
end if;
if old.processor_fee_cents is not null and new.processor_fee_cents is distinct from old.processor_fee_cents then raise exception 'A tarifa já foi registrada.'; end if;
if new.status is distinct from old.status then
ok := case old.status
when 'aberta' then new.status in ('vencida','em_processamento','paga','cancelada')
when 'vencida' then new.status in ('em_processamento','paga','cancelada')
when 'em_processamento' then new.status in ('aberta','vencida','paga','cancelada')
when 'paga' then new.status = 'estornada'
else false end;
if not ok then raise exception 'Mudança de estado inválida: % para %.', old.status, new.status; end if;
end if;
new.updated_at := now();
return new;
end $$;

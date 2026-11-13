-- PASSO 81: 0088_cobranca_motor — parte 6 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
if old.provider_ref is not null and (new.provider_ref is distinct from old.provider_ref or new.provider is distinct from old.provider) then
raise exception 'A referência do provedor já foi definida e não pode mudar.';
end if;
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

drop trigger if exists trg_platform_charges_guard on public.platform_charges;

create trigger trg_platform_charges_guard before update or delete on public.platform_charges
for each row execute function public.platform_charges_guard();

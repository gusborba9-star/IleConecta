-- PASSO 131: 0095_reembolso_creditos_7_dias — parte 3 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_credit_refunds_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reembolso não pode ser apagado.'; end if;
if old.status <> 'pendente' then raise exception 'Reembolso encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.charge_id is distinct from old.charge_id or new.house_id is distinct from old.house_id or new.pack_id is distinct from old.pack_id
or new.credits is distinct from old.credits or new.amount_cents is distinct from old.amount_cents or new.created_at is distinct from old.created_at then
raise exception 'Valor e pacote do reembolso não podem ser alterados.';
end if;
new.updated_at := now();
return new;
end $$;

drop trigger if exists trg_platform_credit_refunds_guard on public.platform_credit_refunds;

create trigger trg_platform_credit_refunds_guard before update or delete on public.platform_credit_refunds
for each row execute function public.platform_credit_refunds_guard();

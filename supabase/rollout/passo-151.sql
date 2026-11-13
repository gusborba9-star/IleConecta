-- PASSO 151: 0098_reembolso_plano_7_dias — parte 5 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
alter table public.platform_plan_refunds enable row level security;

drop policy if exists ppr_read on public.platform_plan_refunds;

create policy ppr_read on public.platform_plan_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.platform_plan_refunds_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reembolso não pode ser apagado.'; end if;
if old.status <> 'pendente' then raise exception 'Reembolso encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.charge_id is distinct from old.charge_id or new.house_id is distinct from old.house_id
or new.amount_cents is distinct from old.amount_cents or new.created_at is distinct from old.created_at then
raise exception 'Valor e fatura do reembolso não podem ser alterados.';
end if;
new.updated_at := now();
return new;
end $$;

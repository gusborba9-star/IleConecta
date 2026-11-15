-- PASSO 223: 0114_destaque_e_impulsionamento — parte 3 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) reembolsos ============
create table if not exists public.promo_refunds (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
promotion_id uuid not null references public.promotions(id) on delete restrict,
reason text not null default 'pedido' check (reason in ('pedido', 'sem_vaga')),
days_refunded int not null check (days_refunded > 0),
days_used int not null check (days_used >= 0),
prev_days int not null check (prev_days > 0),
amount_cents bigint not null check (amount_cents > 0),
status text not null default 'pendente' check (status in ('pendente', 'concluido', 'falhou')),
provider text,
provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
error text check (error is null or char_length(error) <= 300),
requested_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
done_at timestamptz
);

create unique index if not exists promo_refunds_one_active on public.promo_refunds (charge_id) where status in ('pendente', 'concluido');

alter table public.promo_refunds enable row level security;

drop policy if exists promo_refunds_read on public.promo_refunds;

create policy promo_refunds_read on public.promo_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.promo_refunds_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reembolso não pode ser apagado.'; end if;
if old.status <> 'pendente' then raise exception 'Reembolso encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.charge_id is distinct from old.charge_id or new.house_id is distinct from old.house_id or new.promotion_id is distinct from old.promotion_id
or new.days_refunded is distinct from old.days_refunded or new.days_used is distinct from old.days_used or new.prev_days is distinct from old.prev_days
or new.amount_cents is distinct from old.amount_cents or new.reason is distinct from old.reason or new.created_at is distinct from old.created_at then
raise exception 'Valor e dias do reembolso não podem ser alterados.';
end if;
new.updated_at := now();
return new;
end $$;

drop trigger if exists trg_promo_refunds_guard on public.promo_refunds;

create trigger trg_promo_refunds_guard before update or delete on public.promo_refunds for each row execute function public.promo_refunds_guard();

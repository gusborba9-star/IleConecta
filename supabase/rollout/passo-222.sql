-- PASSO 222: 0114_destaque_e_impulsionamento — parte 2 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.promotions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Compra de destaque ou impulsionamento não pode ser apagada.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.kind is distinct from old.kind or new.scope is distinct from old.scope
or new.item_type is distinct from old.item_type or new.item_id is distinct from old.item_id or new.amount_cents is distinct from old.amount_cents
or new.authorized_at is distinct from old.authorized_at or new.created_at is distinct from old.created_at
or (old.charge_id is not null and new.charge_id is distinct from old.charge_id) then
raise exception 'Dados da compra não podem ser alterados.';
end if;
return new;
end $$;

drop trigger if exists trg_promotions_guard on public.promotions;

create trigger trg_promotions_guard before update or delete on public.promotions for each row execute function public.promotions_guard();

-- fila de espera do destaque (aviso quando abrir vaga)
create table if not exists public.promo_waitlist (
house_id uuid not null references public.houses(id) on delete cascade,
scope text not null check (scope in ('cidade', 'estado', 'pais')),
created_at timestamptz not null default now(),
primary key (house_id, scope)
);

alter table public.promo_waitlist enable row level security;

drop policy if exists promo_waitlist_read on public.promo_waitlist;

create policy promo_waitlist_read on public.promo_waitlist for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

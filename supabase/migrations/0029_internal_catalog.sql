-- Catálogo interno da casa: serviços ocasionais que NÃO aparecem na página pública.
-- Só a dona da casa lê e escreve (a assistente lê pelo servidor, com a chave de serviço).
create table if not exists public.house_catalog_items (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  price_cents bigint check (price_cents is null or (price_cents >= 0 and price_cents <= 10000000)),
  -- A assistente só pode informar o valor ao cliente se a casa liberar.
  show_price boolean not null default false,
  -- 'combinar': a assistente explica e passa para a casa. ('agenda' entra com a agenda da casa.)
  mode text not null default 'combinar' check (mode in ('combinar', 'agenda')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists house_catalog_items_house_idx on public.house_catalog_items (house_id);
alter table public.house_catalog_items enable row level security;
create policy catalog_owner on public.house_catalog_items for all to authenticated
  using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));
revoke all on public.house_catalog_items from anon;

-- Nome da assistente de uma casa (para o cliente ver "Lara" em vez de "Assistente da casa").
create or replace function public.assistant_display_name(p_owner uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(a.display_name), '')
    from public.assistants a join public.houses h on h.id = a.house_id
   where h.owner_id = p_owner and a.enabled;
$$;
revoke all on function public.assistant_display_name(uuid) from public, anon;
grant execute on function public.assistant_display_name(uuid) to authenticated;

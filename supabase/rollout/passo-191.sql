-- PASSO 191: 0105_exclusao_conta_pendencias_financeiras — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) fila do provedor de pagamento ============
create table if not exists public.provider_cleanup_pending (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
  kind text not null check (kind in ('payment_method', 'customer')),
  ref text not null check (char_length(ref) between 1 and 200),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (provider, kind, ref)
);

alter table public.provider_cleanup_pending enable row level security;

revoke all on public.provider_cleanup_pending from anon, authenticated;

create or replace function public.provider_cleanup_list(p_limit integer default 20)
returns table (id uuid, provider text, kind text, ref text)
language sql stable security definer set search_path = public as $$
select c.id, c.provider, c.kind, c.ref from public.provider_cleanup_pending c order by c.created_at limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.provider_cleanup_mark(p_id uuid, p_done boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_done then delete from public.provider_cleanup_pending where id = p_id;
  else update public.provider_cleanup_pending set attempts = attempts + 1, last_error = left(p_error, 300) where id = p_id; end if;
end $$;

-- ============ 3) anonimização: apaga o cartão guardado e enfileira o provedor ============
create or replace function public.anonymize_account_and_queue(p_user uuid, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare files jsonb; c record;
begin
  for c in select f.provider, f.customer_ref, f.method_ref from public.house_card_on_file f join public.houses h on h.id = f.house_id where h.owner_id = p_user loop
    if c.method_ref is not null then insert into public.provider_cleanup_pending (provider, kind, ref) values (c.provider, 'payment_method', c.method_ref) on conflict do nothing; end if;
    insert into public.provider_cleanup_pending (provider, kind, ref) values (c.provider, 'customer', c.customer_ref) on conflict do nothing;
  end loop;
  delete from public.house_card_on_file f using public.houses h where h.id = f.house_id and h.owner_id = p_user;
  files := public.anonymize_account(p_user, p_request);
  insert into public.auth_cleanup_pending (user_id) values (p_user) on conflict do nothing;
  return files;
end $$;

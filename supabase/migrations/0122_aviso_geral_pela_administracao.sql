-- 0122 — Aviso da administração pelo painel: para todos, só casas, só clientes ou pessoas escolhidas. Notificação com texto curto e link opcional.
-- Só a administração usa; não repete o mesmo texto para quem já recebeu; cada envio fica registrado.

-- ============ 1) Registro dos envios
create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  text text not null,
  href text,
  audience text not null check (audience in ('todos', 'casas', 'clientes', 'selecionados')),
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.admin_announcements enable row level security;
revoke all on table public.admin_announcements from public, anon, authenticated;

-- ============ 2) Quantas pessoas receberiam (pré-visualização antes de enviar)
create or replace function public.admin_announce_count(p_audience text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if p_audience not in ('todos', 'casas', 'clientes') then raise exception 'Público inválido.'; end if;
  select count(*) into n from public.profiles p where p_audience = 'todos' or (p_audience = 'casas' and p.account_type = 'casa') or (p_audience = 'clientes' and p.account_type = 'cliente');
  return n;
end $$;

-- ============ 3) Buscar pessoas para o envio dirigido
create or replace function public.admin_search_recipients(p_q text)
returns table (id uuid, display_name text, account_type text, house_name text)
language plpgsql security definer set search_path = public as $$
declare q text := btrim(coalesce(p_q, ''));
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if char_length(q) < 2 then return; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.display_name, p.account_type::text, h.name
    from public.profiles p left join public.houses h on h.owner_id = p.id
    where p.display_name ilike '%' || q || '%' or h.name ilike '%' || q || '%'
    order by p.display_name limit 15;
end $$;

-- ============ 4) Enviar
create or replace function public.admin_announce(p_text text, p_href text, p_audience text, p_user_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_text, '')); n integer;
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if char_length(t) < 10 or char_length(t) > 400 then raise exception 'O texto do aviso deve ter de 10 a 400 caracteres.'; end if;
  if p_href is not null and p_href <> '' and p_href !~ '^/([A-Za-z0-9_?=&#.-][A-Za-z0-9/_?=&#.-]{0,199})?$' then raise exception 'Endereço do aviso inválido.'; end if;
  if p_audience not in ('todos', 'casas', 'clientes', 'selecionados') then raise exception 'Público inválido.'; end if;
  if p_audience = 'selecionados' and (p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) not between 1 and 200) then raise exception 'Escolha de 1 a 200 pessoas.'; end if;
  insert into public.notifications (user_id, text, href)
  select p.id, t, nullif(p_href, '') from public.profiles p
  where (p_audience = 'todos' or (p_audience = 'casas' and p.account_type = 'casa') or (p_audience = 'clientes' and p.account_type = 'cliente')
         or (p_audience = 'selecionados' and p.id = any (p_user_ids)))
    and not exists (select 1 from public.notifications x where x.user_id = p.id and x.text = t);
  get diagnostics n = row_count;
  insert into public.admin_announcements (admin_id, text, href, audience, recipients) values (auth.uid(), t, nullif(p_href, ''), p_audience, n);
  return n;
end $$;

-- ============ 5) Histórico
create or replace function public.admin_announcements_list()
returns table (id uuid, text text, href text, audience text, recipients integer, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select a.id, a.text, a.href, a.audience, a.recipients, a.created_at from public.admin_announcements a order by a.created_at desc limit 30;
end $$;

-- ============ 6) Permissões
revoke all on function public.admin_announce_count(text), public.admin_search_recipients(text), public.admin_announce(text, text, text, uuid[]), public.admin_announcements_list() from public, anon;
grant execute on function public.admin_announce_count(text), public.admin_search_recipients(text), public.admin_announce(text, text, text, uuid[]), public.admin_announcements_list() to authenticated;

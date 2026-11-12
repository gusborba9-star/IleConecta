-- PASSO 51: 0079_ferramentas_de_conta — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0079 — Suporte: ferramentas de conta (e-mail de contato, suspensão, exportação de dados, exclusão de conta).
-- Exclusão = anonimização: a conta deixa de existir para as pessoas, os dados pessoais e o conteúdo são apagados e os registros
-- financeiros e os aceites dos Termos ficam, sem nome (a lei exige guardar; ver docs/legal/POLITICA_RETENCAO_E_EXCLUSAO.md).
-- A parte de autenticação (senha, e-mail de login, bloqueio de entrada) é feita pela função de borda "support-admin".
-- É seguro repetir.

-- ============ 1) e-mail de contato do suporte (editável no painel) ============
create table if not exists public.support_contact (
  id boolean primary key default true check (id),
  email text check (email is null or (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),   -- vazio até o proprietário cadastrar o e-mail de suporte
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.support_contact enable row level security;

revoke all on public.support_contact from anon, authenticated;

insert into public.support_contact (id, email) values (true, null) on conflict (id) do nothing;

create or replace function public.support_contact_email()
returns text language sql stable security definer set search_path = public as $$
  select email from public.support_contact where id;
$$;

create or replace function public.admin_set_support_email(p_email text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare old_email text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo da troca.'; end if;
  -- vazio apaga o e-mail (a página Suporte deixa de mostrá-lo)
  if nullif(btrim(coalesce(p_email, '')), '') is not null and (char_length(btrim(p_email)) > 120 or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'E-mail inválido.'; end if;
  select email into old_email from public.support_contact where id;
  insert into public.support_contact (id, email, updated_by) values (true, lower(nullif(btrim(coalesce(p_email, '')), '')), auth.uid())
    on conflict (id) do update set email = excluded.email, updated_at = now(), updated_by = auth.uid();
  insert into public.support_case_log (case_id, actor, action, reason, data)
    values (null, auth.uid(), 'email_contato_alterado', left(btrim(p_reason), 300), jsonb_build_object('de', old_email, 'para', lower(nullif(btrim(coalesce(p_email, '')), ''))));
end $$;

-- ============ 2) suspensão reversível ============
create table if not exists public.account_suspensions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 500),
  case_id uuid,
  suspended_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz not null default now()
);

alter table public.account_suspensions enable row level security;

revoke all on public.account_suspensions from anon, authenticated;

create or replace function public.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_suspensions where user_id = p_user);
$$;

revoke all on function public.is_suspended(uuid) from public, anon, authenticated;

-- Conta suspensa não envia mensagem, não publica, não reserva, não contrata e não avalia. Continua podendo falar com o suporte.
create or replace function public.reject_suspended_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); uid uuid;
begin
  uid := case tg_table_name
    when 'messages' then (j ->> 'sender_id')::uuid
    when 'reservations' then (j ->> 'user_id')::uuid
    when 'service_orders' then (j ->> 'client_id')::uuid
    when 'reviews' then (j ->> 'author_id')::uuid
    when 'post_comments' then (j ->> 'user_id')::uuid
    when 'posts' then (select h.owner_id from public.houses h where h.id = (j ->> 'house_id')::uuid)
    when 'events' then (select h.owner_id from public.houses h where h.id = (j ->> 'house_id')::uuid)
    when 'services' then (select h.owner_id from public.houses h where h.id = (j ->> 'house_id')::uuid)
  end;
  if uid is not null and exists (select 1 from public.account_suspensions where user_id = uid) then
    raise exception 'Sua conta está suspensa. Fale com o suporte para entender o motivo.' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['messages','reservations','service_orders','reviews','post_comments','posts','events','services'] loop
    execute format('drop trigger if exists trg_reject_suspended on public.%I', t);
    execute format('create trigger trg_reject_suspended before insert on public.%I for each row execute function public.reject_suspended_actor()', t);
  end loop;
end $$;

create or replace function public.admin_suspend_account(p_user uuid, p_reason text, p_case uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 or char_length(p_reason) > 500 then raise exception 'Informe o motivo (10 a 500 caracteres).'; end if;
  if p_user = auth.uid() then raise exception 'Você não pode suspender a própria conta.'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Administrador não é suspenso por aqui.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null) then raise exception 'Conta não encontrada.'; end if;
  insert into public.account_suspensions (user_id, reason, case_id, suspended_by) values (p_user, btrim(p_reason), p_case, auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, case_id = excluded.case_id, suspended_by = excluded.suspended_by, suspended_at = now();
  insert into public.support_case_log (case_id, actor, action, reason, data) values (p_case, auth.uid(), 'conta_suspensa', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user));
  insert into public.notifications (user_id, text, href) values (p_user, 'Sua conta foi suspensa. Fale com o suporte para entender o motivo.', '/suporte');
end $$;

-- 0194 — Comunicados da administração também por e-mail (23/11/2026). Só serviço e informação (regras, Termos, avisos da plataforma).
-- O envio de e-mail sai em lotes pela fila; a notificação no app continua como antes. Só a administração marca "também por e-mail".

alter table public.admin_announcements add column if not exists also_email boolean not null default false;

create table if not exists public.announcement_mails (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.admin_announcements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  claim_at timestamptz,
  sent_at timestamptz,
  unique (announcement_id, user_id)
);
create index if not exists announcement_mails_due on public.announcement_mails (created_at) where sent_at is null;
alter table public.announcement_mails enable row level security;
revoke all on table public.announcement_mails from public, anon, authenticated;

drop function if exists public.admin_announce(text, text, text, uuid[]);
create or replace function public.admin_announce(p_text text, p_href text, p_audience text, p_user_ids uuid[] default null, p_email boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_text, '')); n integer; v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if char_length(t) < 10 or char_length(t) > 400 then raise exception 'O texto do aviso deve ter de 10 a 400 caracteres.'; end if;
  if p_href is not null and p_href <> '' and p_href !~ '^/([A-Za-z0-9_?=&#.-][A-Za-z0-9/_?=&#.-]{0,199})?$' then raise exception 'Endereço do aviso inválido.'; end if;
  if p_audience not in ('todos', 'casas', 'clientes', 'selecionados') then raise exception 'Público inválido.'; end if;
  if p_audience = 'selecionados' and (p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) not between 1 and 200) then raise exception 'Escolha de 1 a 200 pessoas.'; end if;
  insert into public.admin_announcements (id, admin_id, text, href, audience, recipients, also_email) values (v_id, auth.uid(), t, nullif(p_href, ''), p_audience, 0, coalesce(p_email, false));
  with ins as (
    insert into public.notifications (user_id, text, href)
    select p.id, t, nullif(p_href, '') from public.profiles p
    where (p_audience = 'todos' or (p_audience = 'casas' and p.account_type = 'casa') or (p_audience = 'clientes' and p.account_type = 'cliente')
           or (p_audience = 'selecionados' and p.id = any (p_user_ids)))
      and not exists (select 1 from public.notifications x where x.user_id = p.id and x.text = t)
    returning user_id),
  mails as (insert into public.announcement_mails (announcement_id, user_id) select v_id, i.user_id from ins i where coalesce(p_email, false) returning 1)
  select count(*) into n from ins;
  update public.admin_announcements set recipients = n where id = v_id;
  return n;
end $$;

drop function if exists public.admin_announcements_list();
create or replace function public.admin_announcements_list()
returns table (id uuid, text text, href text, audience text, recipients integer, created_at timestamptz, also_email boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select a.id, a.text, a.href, a.audience, a.recipients, a.created_at, a.also_email from public.admin_announcements a order by a.created_at desc limit 30;
end $$;

create or replace function public.ann_due_mails() returns table (id uuid, email text, text text, href text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    with c as (
      update public.announcement_mails m set claim_at = now()
      where m.id in (select x.id from public.announcement_mails x where x.sent_at is null and x.created_at > now() - interval '3 days'
                       and (x.claim_at is null or x.claim_at < now() - interval '10 minutes') order by x.created_at limit 60 for update skip locked)
      returning m.id, m.announcement_id, m.user_id)
    select c.id, u.email::text, a.text, a.href from c join public.admin_announcements a on a.id = c.announcement_id join auth.users u on u.id = c.user_id;
end $$;

create or replace function public.ann_mark_mailed(p_id uuid) returns void
language sql security definer set search_path = '' as $$ update public.announcement_mails set sent_at = now() where id = p_id and sent_at is null $$;

revoke all on function public.admin_announce(text, text, text, uuid[], boolean), public.admin_announcements_list() from public, anon;
grant execute on function public.admin_announce(text, text, text, uuid[], boolean), public.admin_announcements_list() to authenticated;
revoke all on function public.ann_due_mails(), public.ann_mark_mailed(uuid) from public, anon, authenticated;
grant execute on function public.ann_due_mails(), public.ann_mark_mailed(uuid) to service_role;

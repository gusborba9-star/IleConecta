-- Chat: bloquear e denunciar. É seguro repetir.
-- Bloqueio: quem foi bloqueado não consegue mais enviar mensagem a quem bloqueou (vale também para a assistente).
-- Denúncia: guarda os motivos e as últimas 30 mensagens da conversa, para a equipe avaliar. Só o admin lê.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "blocks: ver os meus" on public.user_blocks;
create policy "blocks: ver os meus" on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid,
  reason text not null check (reason in ('spam','ofensa','golpe','conteudo_improprio','outro')),
  details text,
  snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'aberta' check (status in ('aberta','resolvida')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.chat_reports enable row level security;
revoke all on public.chat_reports from anon, authenticated;

create or replace function public.chat_block_state(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_other);
$$;

create or replace function public.block_user(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_other = auth.uid() then raise exception 'Operação inválida.'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), p_other) on conflict do nothing;
end $$;

create or replace function public.unblock_user(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_other;
end $$;

create or replace function public.report_user(p_other uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; snap jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_other = auth.uid() then raise exception 'Operação inválida.'; end if;
  select cm1.conversation_id into cid from public.conversation_members cm1
    join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
    where cm1.user_id = auth.uid() and cm2.user_id = p_other limit 1;
  select coalesce(jsonb_agg(x order by x.at), '[]'::jsonb) into snap from (
    select m.created_at as at, m.sender_id as sender, m.from_assistant as assistant, m.text as text
    from public.messages m where m.conversation_id = cid order by m.created_at desc limit 30
  ) x;
  insert into public.chat_reports (reporter_id, reported_id, conversation_id, reason, details, snapshot)
  values (auth.uid(), p_other, cid, p_reason, left(nullif(trim(coalesce(p_details, '')), ''), 1000), snap);
end $$;

-- Quem foi bloqueado não envia mensagem a quem bloqueou (inclui a assistente, que escreve em nome da casa).
create or replace function public.reject_blocked_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.conversation_members cm
    join public.user_blocks b on b.blocker_id = cm.user_id and b.blocked_id = new.sender_id
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_reject_blocked_message on public.messages;
create trigger trg_reject_blocked_message before insert on public.messages
  for each row execute function public.reject_blocked_message();

create or replace function public.admin_chat_reports()
returns table (id uuid, reporter_name text, reported_name text, reason text, details text, snapshot jsonb, status text, admin_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select r.id, coalesce(p1.display_name, '—'), coalesce(p2.display_name, '—'), r.reason, r.details, r.snapshot, r.status, r.admin_note, r.created_at
    from public.chat_reports r
    left join public.profiles p1 on p1.id = r.reporter_id
    left join public.profiles p2 on p2.id = r.reported_id
    order by (r.status = 'aberta') desc, r.created_at desc limit 100;
end $$;

create or replace function public.admin_resolve_chat_report(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.chat_reports set status = 'resolvida', admin_note = left(nullif(trim(coalesce(p_note, '')), ''), 500), resolved_at = now() where id = p_id;
end $$;

revoke all on function public.chat_block_state(uuid), public.block_user(uuid), public.unblock_user(uuid), public.report_user(uuid, text, text),
  public.admin_chat_reports(), public.admin_resolve_chat_report(uuid, text) from public, anon;
grant execute on function public.chat_block_state(uuid), public.block_user(uuid), public.unblock_user(uuid), public.report_user(uuid, text, text),
  public.admin_chat_reports(), public.admin_resolve_chat_report(uuid, text) to authenticated;

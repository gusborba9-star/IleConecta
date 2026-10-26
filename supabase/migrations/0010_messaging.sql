-- Mensagens reais entre cliente e casa, com presença da casa (para a assistente atender quando ela estiver offline).
-- Rode no SQL Editor do Supabase. É seguro repetir.

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Batimento de presença: cada pessoa atualiza só o próprio registro.
create or replace function public.touch_presence()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
grant execute on function public.touch_presence() to authenticated;

-- Dados mínimos do interlocutor: nome, foto, se é casa e se está online (visto nos últimos 3 minutos).
create or replace function public.peer_info(p_other uuid)
returns table (id uuid, name text, avatar_url text, is_house boolean, online boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.display_name, ''), 'Usuário'), p.avatar_url,
         (p.account_type::text = 'casa'),
         coalesce(p.last_seen_at > now() - interval '3 minutes', false)
  from public.profiles p
  where p.id = p_other and auth.uid() is not null;
$$;
grant execute on function public.peer_info(uuid) to authenticated;

-- Abre (ou cria) a conversa 1:1 com outra pessoa.
create or replace function public.open_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_other is null or p_other = auth.uid() then raise exception 'Conversa inválida.'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then raise exception 'Pessoa não encontrada.'; end if;
  select a.conversation_id into cid
  from public.conversation_members a
  join public.conversation_members b on b.conversation_id = a.conversation_id
  where a.user_id = auth.uid() and b.user_id = p_other
    and (select count(*) from public.conversation_members m where m.conversation_id = a.conversation_id) = 2
  limit 1;
  if cid is null then
    insert into public.conversations default values returning id into cid;
    insert into public.conversation_members (conversation_id, user_id) values (cid, auth.uid()), (cid, p_other);
  end if;
  return cid;
end $$;
grant execute on function public.open_conversation(uuid) to authenticated;

-- Minhas conversas, da mais recente para a mais antiga.
create or replace function public.my_conversations()
returns table (conversation_id uuid, other_id uuid, other_name text, other_avatar text, other_is_house boolean,
               last_text text, last_at timestamptz, last_from_assistant boolean)
language sql stable security definer set search_path = public as $$
  select m.conversation_id, o.user_id,
         coalesce(nullif(p.display_name, ''), 'Usuário'), p.avatar_url, (p.account_type::text = 'casa'),
         lm.text, coalesce(lm.created_at, c.created_at), coalesce(lm.from_assistant, false)
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  join public.conversation_members o on o.conversation_id = m.conversation_id and o.user_id <> m.user_id
  left join public.profiles p on p.id = o.user_id
  left join lateral (
    select x.text, x.created_at, x.from_assistant from public.messages x
    where x.conversation_id = m.conversation_id order by x.created_at desc limit 1
  ) lm on true
  where m.user_id = auth.uid()
  order by coalesce(lm.created_at, c.created_at) desc;
$$;
grant execute on function public.my_conversations() to authenticated;

-- Mensagens novas chegam na hora para quem participa da conversa (RLS já restringe).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

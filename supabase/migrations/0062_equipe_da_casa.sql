-- Equipe da casa (Premium): a casa (login "pai") convida mais 1 pessoa, define o que ela vê e faz, e o chat mostra "atendido por Nome".
-- O login vinculado não vira a casa: ele atende por funções próprias, só no que o "pai" liberou.

alter table public.messages add column if not exists staff_name text;

create table if not exists public.house_staff (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  can_reply boolean not null default true,
  can_orders boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id)
);
create table if not exists public.house_staff_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  can_reply boolean not null default true,
  can_orders boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
alter table public.house_staff enable row level security;
alter table public.house_staff_invites enable row level security;

drop policy if exists "equipe: a casa gerencia" on public.house_staff;
create policy "equipe: a casa gerencia" on public.house_staff for all to authenticated
  using (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()));
drop policy if exists "equipe: vê o próprio vínculo" on public.house_staff;
create policy "equipe: vê o próprio vínculo" on public.house_staff for select to authenticated using (user_id = auth.uid());
drop policy if exists "convites da equipe: a casa gerencia" on public.house_staff_invites;
create policy "convites da equipe: a casa gerencia" on public.house_staff_invites for all to authenticated
  using (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()));

-- Premium: o dono + 1 pessoa (vínculo ou convite pendente).
create or replace function public.staff_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan; n int;
begin
  select plan into p from public.houses where id = new.house_id;
  if p is distinct from 'maximo' then raise exception 'A equipe da casa faz parte do plano Premium.'; end if;
  select (select count(*) from public.house_staff where house_id = new.house_id)
       + (select count(*) from public.house_staff_invites where house_id = new.house_id and used_at is null and expires_at > now())
    into n;
  if n >= 1 then raise exception 'O Premium inclui 2 acessos: o seu e mais 1 da equipe.'; end if;
  return new;
end $$;
drop trigger if exists trg_staff_limit on public.house_staff_invites;
create trigger trg_staff_limit before insert on public.house_staff_invites
  for each row execute function public.staff_plan_limit();

-- Aceitar o convite (a pessoa já logada na própria conta).
create or replace function public.accept_staff_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare i public.house_staff_invites; h public.houses;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar.'; end if;
  select * into i from public.house_staff_invites where token = p_token and used_at is null and expires_at > now();
  if i.token is null then raise exception 'Este convite expirou ou já foi usado.'; end if;
  select * into h from public.houses where id = i.house_id;
  if h.owner_id = auth.uid() then raise exception 'Este é o convite da sua própria casa.'; end if;
  if h.plan <> 'maximo' then raise exception 'A casa não está no plano Premium.'; end if;
  if exists (select 1 from public.houses where owner_id = auth.uid()) then raise exception 'Use uma conta de cliente para atender pela casa.'; end if;
  if exists (select 1 from public.house_staff where user_id = auth.uid()) then raise exception 'Você já atende por uma casa.'; end if;
  insert into public.house_staff (house_id, user_id, name, can_reply, can_orders) values (i.house_id, auth.uid(), i.name, i.can_reply, i.can_orders);
  update public.house_staff_invites set used_at = now() where token = p_token;
  return h.name;
end $$;
revoke all on function public.accept_staff_invite(text) from public;
grant execute on function public.accept_staff_invite(text) to authenticated;

-- Vínculo de quem está logado (vazio se a casa saiu do Premium).
create or replace function public.my_staff_house()
returns table (house_id uuid, house_name text, owner_id uuid, staff_name text, can_reply boolean, can_orders boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.name, h.owner_id, s.name, s.can_reply, s.can_orders
  from public.house_staff s join public.houses h on h.id = s.house_id
  where s.user_id = auth.uid() and h.plan = 'maximo';
$$;
revoke all on function public.my_staff_house() from public;
grant execute on function public.my_staff_house() to authenticated;

create or replace function public.staff_can_see_conversation(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.house_staff s
    join public.houses h on h.id = s.house_id and h.plan = 'maximo'
    join public.conversation_members cm on cm.user_id = h.owner_id
    where s.user_id = auth.uid() and cm.conversation_id = c
  );
$$;
revoke all on function public.staff_can_see_conversation(uuid) from public;
grant execute on function public.staff_can_see_conversation(uuid) to authenticated;

create or replace function public.staff_conversations()
returns table (conversation_id uuid, other_id uuid, other_name text, last_text text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with st as (select h.owner_id from public.house_staff s join public.houses h on h.id = s.house_id and h.plan = 'maximo' where s.user_id = auth.uid())
  select cm.conversation_id, o.user_id, coalesce(p.display_name, 'Cliente'),
         (select m.text from public.messages m where m.conversation_id = cm.conversation_id and m.deleted_at is null order by m.created_at desc limit 1),
         (select m.created_at from public.messages m where m.conversation_id = cm.conversation_id and m.deleted_at is null order by m.created_at desc limit 1)
  from st
  join public.conversation_members cm on cm.user_id = st.owner_id
  join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id <> st.owner_id
  left join public.profiles p on p.id = o.user_id
  order by 5 desc nulls last
  limit 100;
$$;
revoke all on function public.staff_conversations() from public;
grant execute on function public.staff_conversations() to authenticated;

create or replace function public.staff_messages(p_conv uuid)
returns table (id uuid, from_house boolean, text text, created_at timestamptz, staff_name text, from_assistant boolean,
               attachment_path text, attachment_type text, attachment_name text, attachment_size int)
language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
  if not public.staff_can_see_conversation(p_conv) then raise exception 'Conversa indisponível.'; end if;
  select h.owner_id into o from public.house_staff s join public.houses h on h.id = s.house_id where s.user_id = auth.uid();
  return query
    select m.id, (m.sender_id = o), m.text, m.created_at, m.staff_name, coalesce(m.from_assistant, false),
           m.attachment_path, m.attachment_type, m.attachment_name, m.attachment_size
    from public.messages m where m.conversation_id = p_conv and m.deleted_at is null
    order by m.created_at limit 200;
end $$;
revoke all on function public.staff_messages(uuid) from public;
grant execute on function public.staff_messages(uuid) to authenticated;

create or replace function public.staff_send(p_conv uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.house_staff; o uuid;
begin
  select st.* into s from public.house_staff st join public.houses h on h.id = st.house_id and h.plan = 'maximo' where st.user_id = auth.uid();
  if s.id is null then raise exception 'Você não atende por nenhuma casa.'; end if;
  if not s.can_reply then raise exception 'O seu acesso não inclui responder conversas.'; end if;
  if not public.staff_can_see_conversation(p_conv) then raise exception 'Conversa indisponível.'; end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then raise exception 'Escreva a mensagem.'; end if;
  select owner_id into o from public.houses where id = s.house_id;
  insert into public.messages (conversation_id, sender_id, text, from_assistant, staff_name)
    values (p_conv, o, left(trim(p_text), 2000), false, s.name);
end $$;
revoke all on function public.staff_send(uuid, text) from public;
grant execute on function public.staff_send(uuid, text) to authenticated;

create or replace function public.staff_orders()
returns table (id uuid, title text, status text, client_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare s public.house_staff;
begin
  select st.* into s from public.house_staff st join public.houses h on h.id = st.house_id and h.plan = 'maximo' where st.user_id = auth.uid();
  if s.id is null or not s.can_orders then raise exception 'O seu acesso não inclui os pedidos.'; end if;
  return query
    select o.id, o.title, o.status::text, coalesce(p.display_name, 'Cliente'), o.created_at
    from public.service_orders o left join public.profiles p on p.id = o.client_id
    where o.house_id = s.house_id order by o.created_at desc limit 50;
end $$;
revoke all on function public.staff_orders() from public;
grant execute on function public.staff_orders() to authenticated;

-- A equipe vê os arquivos das conversas da casa.
drop policy if exists "chat-files: equipe lê" on storage.objects;
create policy "chat-files: equipe lê" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.staff_can_see_conversation(((storage.foldername(name))[1])::uuid));

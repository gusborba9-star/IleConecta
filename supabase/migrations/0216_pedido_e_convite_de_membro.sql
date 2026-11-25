-- Adesão de membros a distância, pelo chat e pela página da casa (aprovado pelo proprietário em 24/11/2026).
-- Duas direções, sem link para circular fora da plataforma: "pedido" (a pessoa pede para ser membro; a casa aceita ou recusa) e
-- "convite" (a casa convida quem já conversou com ela pelo chat; a pessoa aceita ou recusa). Um pedido pendente por casa e pessoa.
-- Recusa é silenciosa (o pedido some) e vale um intervalo de 7 dias antes de novo pedido/convite; sem resposta, expira em 30 dias.
-- Quem bloqueou ou foi bloqueado não envia nem recebe. Ao aceitar, a pessoa entra com as regras de membro de sempre (consentimento registrado).
create table if not exists public.member_requests (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('pedido', 'convite')),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'recusado', 'cancelado', 'expirado')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists member_requests_one_pending on public.member_requests (house_id, user_id) where status = 'pendente';
create index if not exists member_requests_user_idx on public.member_requests (user_id, status);
create index if not exists member_requests_house_idx on public.member_requests (house_id, status);
alter table public.member_requests enable row level security;
revoke all on public.member_requests from public, anon, authenticated;

-- ---------- regras comuns ----------
create or replace function public.member_req_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke all on function public.member_req_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.member_req_cooling(p_house uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.member_requests where house_id = p_house and user_id = p_user and status = 'recusado' and decided_at > now() - interval '7 days');
$$;
revoke all on function public.member_req_cooling(uuid, uuid) from public, anon, authenticated;

-- A pessoa pede para ser membro da casa (p_owner = conta da dona da casa).
create or replace function public.member_request_create(p_owner uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h public.houses%rowtype; pname text; rid uuid;
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if (select account_type::text from public.profiles where id = uid) <> 'cliente' then raise exception 'Só contas de pessoa pedem para ser membro.'; end if;
  select * into h from public.houses where owner_id = p_owner;
  if not found then raise exception 'Casa não encontrada.'; end if;
  if public.member_req_blocked(uid, p_owner) then raise exception 'Não foi possível enviar o pedido.'; end if;
  if exists (select 1 from public.house_members where house_id = h.id and user_id = uid and left_at is null) then raise exception 'Você já é membro desta casa.'; end if;
  if exists (select 1 from public.member_requests where house_id = h.id and user_id = uid and status = 'pendente' and created_at > now() - interval '30 days') then
    raise exception 'Já existe um pedido ou convite aguardando resposta. Veja a conversa com a casa.';
  end if;
  if public.member_req_cooling(h.id, uid) then raise exception 'A casa respondeu há pouco tempo. Tente de novo em alguns dias.'; end if;
  if (select count(*) from public.member_requests where user_id = uid and direction = 'pedido' and created_at > now() - interval '1 day') >= 10 then raise exception 'Você já enviou muitos pedidos hoje. Tente amanhã.'; end if;
  update public.member_requests set status = 'expirado', decided_at = now() where house_id = h.id and user_id = uid and status = 'pendente' and created_at <= now() - interval '30 days';
  insert into public.member_requests (house_id, user_id, direction) values (h.id, uid, 'pedido') returning id into rid;
  select coalesce(nullif(btrim(display_name), ''), 'Uma pessoa') into pname from public.profiles where id = uid;
  insert into public.notifications (user_id, text, href) values (h.owner_id, pname || ' pediu para ser membro da sua casa. Responda pela conversa ou em Membros.', '/mensagens/' || uid);
  return rid;
end $$;

-- A casa convida alguém que já conversou com ela pelo chat (p_user = conta da pessoa).
create or replace function public.member_request_invite(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h public.houses%rowtype; rid uuid;
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into h from public.houses where owner_id = uid;
  if not found then raise exception 'Só a casa convida para ser membro.' using errcode = '42501'; end if;
  if p_user is null or p_user = uid or (select account_type::text from public.profiles where id = p_user) is distinct from 'cliente' then raise exception 'Pessoa inválida.'; end if;
  if not exists (select 1 from public.conversation_members a join public.conversation_members b on b.conversation_id = a.conversation_id where a.user_id = uid and b.user_id = p_user) then
    raise exception 'Só dá para convidar quem já conversou com a casa pelo chat.';
  end if;
  if public.member_req_blocked(uid, p_user) then raise exception 'Não foi possível enviar o convite.'; end if;
  if exists (select 1 from public.house_members where house_id = h.id and user_id = p_user and left_at is null) then raise exception 'Esta pessoa já é membro.'; end if;
  if exists (select 1 from public.member_requests where house_id = h.id and user_id = p_user and status = 'pendente' and created_at > now() - interval '30 days') then
    raise exception 'Já existe um pedido ou convite aguardando resposta.';
  end if;
  if public.member_req_cooling(h.id, p_user) then raise exception 'A pessoa respondeu há pouco tempo. Tente de novo em alguns dias.'; end if;
  if (select count(*) from public.member_requests where house_id = h.id and direction = 'convite' and created_at > now() - interval '1 day') >= 20 then raise exception 'Muitos convites hoje. Tente amanhã.'; end if;
  update public.member_requests set status = 'expirado', decided_at = now() where house_id = h.id and user_id = p_user and status = 'pendente' and created_at <= now() - interval '30 days';
  insert into public.member_requests (house_id, user_id, direction) values (h.id, p_user, 'convite') returning id into rid;
  insert into public.notifications (user_id, text, href) values (p_user, h.name || ' convidou você para ser membro da casa. Abra a conversa para aceitar ou recusar.', '/mensagens/' || uid);
  return rid;
end $$;

-- Estado entre quem está logado e a outra conta (usado no chat e na página da casa).
create or replace function public.member_request_between(p_other uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); h public.houses%rowtype; p_user uuid; r public.member_requests%rowtype; i_own boolean; v_type text; o_type text;
        v_member boolean; v_can boolean := false;
begin
  if uid is null or p_other is null or p_other = uid then return null; end if;
  select account_type::text into v_type from public.profiles where id = uid;
  select account_type::text into o_type from public.profiles where id = p_other;
  if v_type = 'casa' and o_type = 'cliente' then select * into h from public.houses where owner_id = uid; p_user := p_other; i_own := true;
  elsif v_type = 'cliente' and o_type = 'casa' then select * into h from public.houses where owner_id = p_other; p_user := uid; i_own := false;
  else return null; end if;
  if h.id is null then return null; end if;
  v_member := exists (select 1 from public.house_members where house_id = h.id and user_id = p_user and left_at is null);
  select * into r from public.member_requests where house_id = h.id and user_id = p_user and status = 'pendente' and created_at > now() - interval '30 days' order by created_at desc limit 1;
  if r.id is null and not v_member and not public.member_req_blocked(uid, p_other) and not public.member_req_cooling(h.id, p_user) then
    v_can := true;
    if i_own then v_can := exists (select 1 from public.conversation_members a join public.conversation_members b on b.conversation_id = a.conversation_id where a.user_id = uid and b.user_id = p_other); end if;
  end if;
  return jsonb_build_object(
    'house_name', h.name, 'is_member', v_member, 'i_am_house', i_own, 'can_start', v_can,
    'pending', case when r.id is null then null else jsonb_build_object('id', r.id, 'direction', r.direction, 'created_at', r.created_at,
      'mine', (r.direction = 'pedido' and not i_own) or (r.direction = 'convite' and i_own)) end);
end $$;

-- Responder: a casa responde pedidos; a pessoa responde convites. Aceitar torna a pessoa membro (mesmas regras do convite por link).
create or replace function public.member_request_respond(p_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.member_requests%rowtype; h public.houses%rowtype; st public.house_member_settings%rowtype;
        mid uuid; pname text; cur date := public.member_month(public.member_today());
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into r from public.member_requests where id = p_id and status = 'pendente' for update;
  if not found or r.created_at <= now() - interval '30 days' then raise exception 'Este pedido não está mais válido.'; end if;
  select * into h from public.houses where id = r.house_id;
  if not ((r.direction = 'pedido' and h.owner_id = uid) or (r.direction = 'convite' and r.user_id = uid)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_accept is not true then
    update public.member_requests set status = 'recusado', decided_at = now() where id = r.id;
    return jsonb_build_object('ok', true, 'status', 'recusado');
  end if;
  select id into mid from public.house_members where house_id = r.house_id and user_id = r.user_id and left_at is null;
  if mid is null then
    if (select count(*) from public.house_members where house_id = r.house_id and left_at is null) >= 500 then raise exception 'Esta casa atingiu o limite de membros.'; end if;
    select coalesce(nullif(btrim(display_name), ''), 'Membro') into pname from public.profiles where id = r.user_id;
    select * into st from public.house_member_settings where house_id = r.house_id;
    insert into public.house_members (house_id, user_id, display_name, monthly_cents, due_day, start_month, consent_at, consent_version)
    values (r.house_id, r.user_id, pname, coalesce(st.default_cents, 0), coalesce(st.default_due_day, 10), public.member_default_start(coalesce(st.default_due_day, 10)), now(), 1)
    returning id into mid;
    perform public.member_ensure_due(mid, cur);
  end if;
  update public.member_requests set status = 'aceito', decided_at = now() where id = r.id;
  if r.direction = 'pedido' then
    insert into public.notifications (user_id, text, href) values (r.user_id, h.name || ' aceitou o seu pedido: você agora é membro da casa.', '/mensagens/' || h.owner_id);
  else
    select coalesce(nullif(btrim(display_name), ''), 'Uma pessoa') into pname from public.profiles where id = r.user_id;
    insert into public.notifications (user_id, text, href) values (h.owner_id, pname || ' aceitou o convite e agora é membro da sua casa.', '/painel/membros');
  end if;
  return jsonb_build_object('ok', true, 'status', 'aceito', 'member_id', mid);
end $$;

-- Quem enviou pode cancelar enquanto estiver pendente.
create or replace function public.member_request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.member_requests%rowtype; h public.houses%rowtype;
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into r from public.member_requests where id = p_id and status = 'pendente' for update;
  if not found then return; end if;
  select * into h from public.houses where id = r.house_id;
  if not ((r.direction = 'pedido' and r.user_id = uid) or (r.direction = 'convite' and h.owner_id = uid)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.member_requests set status = 'cancelado', decided_at = now() where id = r.id;
end $$;

-- Lista da casa (tela de Membros): pedidos de pessoas aguardando resposta.
create or replace function public.member_requests_for_house() returns table (id uuid, user_id uuid, name text, direction text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select r.id, r.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Pessoa'), r.direction, r.created_at
      from public.member_requests r join public.houses h on h.id = r.house_id join public.profiles p on p.id = r.user_id
     where h.owner_id = auth.uid() and r.status = 'pendente' and r.created_at > now() - interval '30 days'
     order by r.created_at desc limit 100;
end $$;

revoke execute on function public.member_request_create(uuid), public.member_request_invite(uuid), public.member_request_between(uuid), public.member_request_respond(uuid, boolean),
  public.member_request_cancel(uuid), public.member_requests_for_house() from public, anon;
grant execute on function public.member_request_create(uuid), public.member_request_invite(uuid), public.member_request_between(uuid), public.member_request_respond(uuid, boolean),
  public.member_request_cancel(uuid), public.member_requests_for_house() to authenticated;

-- Limpeza diária: pedido sem resposta há 30 dias expira; o que já foi decidido some após 90 dias.
select cron.schedule('member-requests-clean', '41 4 * * *', $c$update public.member_requests set status = 'expirado', decided_at = now() where status = 'pendente' and created_at <= now() - interval '30 days'; delete from public.member_requests where status <> 'pendente' and coalesce(decided_at, created_at) < now() - interval '90 days'$c$);

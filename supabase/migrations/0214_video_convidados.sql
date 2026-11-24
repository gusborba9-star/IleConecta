-- Vídeo: a casa escolhe QUEM é convidada para a reunião (todos os membros ou só algumas pessoas) e cada convidado recebe um aviso no sino.
-- Antes: todo membro ativo entrava. Agora: reunião "para todos" continua assim (invite_all); reunião com convidados escolhidos só abre para eles e para a dona.
-- Consulta continua só para o cliente do pedido. O banco confere o convite a cada entrada (video_join_check) e na lista (video_my_upcoming).
alter table public.video_meetings add column if not exists invite_all boolean not null default true;

create table if not exists public.video_invites (
  meeting_id uuid not null references public.video_meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index if not exists video_invites_user_idx on public.video_invites (user_id);
alter table public.video_invites enable row level security;
revoke all on public.video_invites from public, anon, authenticated;

do $$
declare d text; a text; b text;
begin
  -- entrada: membro só entra se a reunião é "para todos" ou se foi convidado
  select pg_get_functiondef('public.video_join_check(uuid)'::regprocedure) into d;
  a := '(m.kind = ''reuniao'' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = v_uid and hm.left_at is null))';
  b := '(m.kind = ''reuniao'' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = v_uid and hm.left_at is null) and (m.invite_all or exists (select 1 from public.video_invites vi where vi.meeting_id = m.id and vi.user_id = v_uid)))';
  if position(a in d) = 0 then raise exception 'video_join_check: texto esperado não encontrado'; end if;
  execute replace(d, a, b);

  -- lista das próximas
  select pg_get_functiondef('public.video_my_upcoming()'::regprocedure) into d;
  a := '(m.kind = ''reuniao'' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = auth.uid() and hm.left_at is null))';
  b := '(m.kind = ''reuniao'' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = auth.uid() and hm.left_at is null) and (m.invite_all or exists (select 1 from public.video_invites vi where vi.meeting_id = m.id and vi.user_id = auth.uid())))';
  if position(a in d) = 0 then raise exception 'video_my_upcoming: texto esperado não encontrado'; end if;
  execute replace(d, a, b);
end $$;

-- Membros da casa que podem ser convidados (só a dona; só quem tem conta e está ativo).
create or replace function public.video_house_members(p_house uuid) returns table (user_id uuid, name text, bond text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_house_owner(p_house) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
    select hm.user_id, coalesce(nullif(btrim(hm.display_name), ''), nullif(btrim(p.display_name), ''), 'Membro'), coalesce(hm.bond, '')
      from public.house_members hm left join public.profiles p on p.id = hm.user_id
     where hm.house_id = p_house and hm.left_at is null and hm.user_id is not null
       and hm.user_id <> auth.uid()
     order by 2 limit 500;
end $$;
revoke execute on function public.video_house_members(uuid) from public, anon;
grant execute on function public.video_house_members(uuid) to authenticated;

-- Marcar: ganha a lista de convidados (null = todos os membros). Troca a assinatura antiga para não haver duas versões.
drop function if exists public.video_schedule(uuid, text, text, timestamptz, integer, integer, uuid);
create or replace function public.video_schedule(p_house uuid, p_kind text, p_title text, p_starts_at timestamptz, p_duration_min int, p_max_participants int default 50, p_order uuid default null, p_invitees uuid[] default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prov text; v_bank jsonb; v_invitee uuid; v_id uuid := gen_random_uuid(); v_max int := p_max_participants;
  v_all boolean := true; v_ids uuid[]; v_n int; v_house text; v_when text;
begin
  if v_uid is null or not public.is_house_owner(p_house) then raise exception 'Só o responsável pela casa marca reuniões por vídeo.' using errcode = '42501'; end if;
  if not public.video_enabled_for(p_house) then raise exception 'O vídeo não está disponível para a sua casa ainda.'; end if;
  if p_kind not in ('reuniao', 'consulta') then raise exception 'Tipo inválido.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'Dê um título de até 80 letras.'; end if;
  if p_duration_min is null or p_duration_min not between 5 and 90 then raise exception 'A duração vai de 5 a 90 minutos.'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '120 days' then raise exception 'Escolha um horário a partir de agora e em até 120 dias.'; end if;
  if (select count(*) from public.video_meetings where house_id = p_house and status = 'agendada' and starts_at >= now() - interval '1 day') >= 60 then raise exception 'Muitas reuniões marcadas: cancele ou espere as próximas acontecerem.'; end if;
  v_bank := public.video_bank_of(p_house);
  if (v_bank ->> 'remaining')::int <= 0 then raise exception 'Os minutos de vídeo deste mês acabaram.'; end if;
  if p_kind = 'consulta' then
    select o.client_id into v_invitee from public.service_orders o where o.id = p_order and o.house_id = p_house and o.status in ('confirmado', 'em_andamento');
    if v_invitee is null then raise exception 'Escolha um pedido desta casa já pago e em andamento para a consulta.'; end if;
    v_max := 2;
  else
    if p_invitees is not null then
      select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_invitees) x where x is not null;
      v_n := coalesce(cardinality(v_ids), 0);
      if v_n = 0 then raise exception 'Escolha pelo menos uma pessoa para convidar.'; end if;
      if v_n > 99 then raise exception 'Escolha até 99 pessoas.'; end if;
      if (select count(*) from public.house_members hm where hm.house_id = p_house and hm.left_at is null and hm.user_id = any (v_ids) and hm.user_id <> v_uid) <> v_n then
        raise exception 'Convide só membros ativos da sua casa (com conta).';
      end if;
      v_all := false;
      v_max := greatest(2, v_n + 1);
    elsif v_max is null or v_max not between 2 and 100 then raise exception 'A reunião comporta de 2 a 100 pessoas.'; end if;
  end if;
  select value ->> 'provider' into v_prov from public.platform_settings where key = 'video';
  insert into public.video_meetings (id, house_id, kind, title, starts_at, duration_min, max_participants, order_id, invitee_id, provider, room_name, created_by, invite_all)
  values (v_id, p_house, p_kind, btrim(p_title), p_starts_at, p_duration_min, v_max, case when p_kind = 'consulta' then p_order end, v_invitee, coalesce(v_prov, 'daily'), 'ic-' || replace(gen_random_uuid()::text, '-', ''), v_uid, v_all);
  if p_kind = 'reuniao' and not v_all then
    insert into public.video_invites (meeting_id, user_id) select v_id, x from unnest(v_ids) x;
  end if;
  -- aviso no sino de quem foi convidado (todos os membros ativos, os escolhidos ou o cliente da consulta)
  select name into v_house from public.houses where id = p_house;
  v_when := to_char(p_starts_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  if p_kind = 'consulta' then
    insert into public.notifications (user_id, text, href) values (v_invitee, 'Consulta por vídeo marcada por ' || coalesce(v_house, 'uma casa') || ' em ' || v_when || '. A sala abre 10 minutos antes.', '/reunioes');
  else
    insert into public.notifications (user_id, text, href)
      select hm.user_id, 'Você foi convidado para a reunião "' || btrim(p_title) || '" de ' || coalesce(v_house, 'uma casa') || ' em ' || v_when || '. A sala abre 10 minutos antes.', '/reunioes'
        from public.house_members hm
       where hm.house_id = p_house and hm.left_at is null and hm.user_id is not null and hm.user_id <> v_uid
         and (v_all or hm.user_id = any (v_ids));
  end if;
  return v_id;
end $$;
revoke execute on function public.video_schedule(uuid, text, text, timestamptz, int, int, uuid, uuid[]) from public, anon;
grant execute on function public.video_schedule(uuid, text, text, timestamptz, int, int, uuid, uuid[]) to authenticated;

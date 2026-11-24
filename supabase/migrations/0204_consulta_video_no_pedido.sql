-- 0204 — Consulta por vídeo ligada ao pedido (24/11/2026).
-- A consulta (2 pessoas) já nascia ligada a um pedido (0179), mas faltavam três cuidados:
--  1) só dá para marcar consulta em pedido JÁ PAGO e em curso (antes valia até "aguardando pagamento": serviço de graça se o pagamento nunca viesse);
--  2) se o pedido for cancelado, expirar, concluir ou for reembolsado, a consulta marcada deixa de valer: some das listas, não abre sala e é cancelada sozinha;
--  3) a casa e o cliente veem a consulta dentro do próprio pedido (função de leitura abaixo; sem nome de sala).
-- Nada de pedido, preço ou pagamento é alterado aqui.

create or replace function public.video_order_active(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.service_orders o where o.id = p_order and o.status in ('confirmado', 'em_andamento'))
$$;

-- 1) marcar: só pedido pago e em curso
create or replace function public.video_schedule(p_house uuid, p_kind text, p_title text, p_starts_at timestamptz, p_duration_min int, p_max_participants int default 50, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prov text; v_bank jsonb; v_invitee uuid; v_id uuid := gen_random_uuid(); v_max int := p_max_participants;
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
    if v_max is null or v_max not between 2 and 100 then raise exception 'A reunião comporta de 2 a 100 pessoas.'; end if;
  end if;
  select value ->> 'provider' into v_prov from public.platform_settings where key = 'video';
  insert into public.video_meetings (id, house_id, kind, title, starts_at, duration_min, max_participants, order_id, invitee_id, provider, room_name, created_by)
  values (v_id, p_house, p_kind, btrim(p_title), p_starts_at, p_duration_min, v_max, case when p_kind = 'consulta' then p_order end, v_invitee, coalesce(v_prov, 'daily'), 'ic-' || replace(gen_random_uuid()::text, '-', ''), v_uid);
  return v_id;
end $$;

-- 2) entrada e lista: consulta só vale com o pedido ativo
create or replace function public.video_join_check(p_meeting uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m public.video_meetings; h record; v_host boolean; v_ok boolean := false; v_live int; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'sem_login'); end if;
  select * into m from public.video_meetings where id = p_meeting;
  if not found or m.status <> 'agendada' then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  if m.kind = 'consulta' and not public.video_order_active(m.order_id) then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  select owner_id, name into h from public.houses where id = m.house_id;
  v_host := h.owner_id = v_uid;
  v_ok := v_host
    or (m.kind = 'reuniao' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = v_uid and hm.left_at is null))
    or (m.kind = 'consulta' and m.invitee_id = v_uid);
  if not v_ok then return jsonb_build_object('ok', false, 'reason', 'sem_acesso'); end if;
  if not public.video_enabled_for(m.house_id) then return jsonb_build_object('ok', false, 'reason', 'desligado'); end if;
  if now() < m.starts_at - interval '10 minutes' then return jsonb_build_object('ok', false, 'reason', 'cedo', 'starts_at', m.starts_at); end if;
  if now() > m.starts_at + make_interval(mins => m.duration_min + 10) then return jsonb_build_object('ok', false, 'reason', 'encerrada'); end if;
  if (public.video_bank_of(m.house_id) ->> 'remaining')::int <= 0 then return jsonb_build_object('ok', false, 'reason', 'sem_minutos'); end if;
  select count(*) into v_live from public.video_usage u where u.meeting_id = m.id and u.left_at is null and u.user_id is distinct from v_uid;
  if v_live >= m.max_participants then return jsonb_build_object('ok', false, 'reason', 'lotada'); end if;
  select coalesce(nullif(btrim(display_name), ''), 'Participante') into v_name from public.profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'room_name', m.room_name, 'provider', m.provider, 'is_host', v_host, 'display_name', left(coalesce(v_name, 'Participante'), 40),
    'user_id', v_uid, 'kind', m.kind, 'title', m.title, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'max_participants', m.max_participants,
    'ends_at', m.starts_at + make_interval(mins => m.duration_min));
end $$;

create or replace function public.video_my_upcoming() returns table (id uuid, house_id uuid, house_name text, kind text, title text, starts_at timestamptz, duration_min int, is_host boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.house_id, h.name, m.kind, m.title, m.starts_at, m.duration_min, (h.owner_id = auth.uid())
  from public.video_meetings m join public.houses h on h.id = m.house_id
  where auth.uid() is not null and m.status = 'agendada'
    and (m.kind = 'reuniao' or public.video_order_active(m.order_id))
    and m.starts_at + make_interval(mins => m.duration_min + 10) >= now() and m.starts_at <= now() + interval '60 days'
    and (h.owner_id = auth.uid()
      or (m.kind = 'reuniao' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = auth.uid() and hm.left_at is null))
      or (m.kind = 'consulta' and m.invitee_id = auth.uid()))
  order by m.starts_at limit 100
$$;

-- pedido que deixa de estar ativo cancela as consultas marcadas dele
create or replace function public.video_order_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('confirmado', 'em_andamento') and old.status is distinct from new.status then
    update public.video_meetings set status = 'cancelada', ended_at = now() where order_id = new.id and kind = 'consulta' and status = 'agendada';
  end if;
  return new;
end $$;
drop trigger if exists video_order_closed on public.service_orders;
create trigger video_order_closed after update of status on public.service_orders for each row execute function public.video_order_closed();

-- 3) consultas de cada pedido, para a casa (dona) e para o cliente convidado
create or replace function public.video_order_meetings(p_orders uuid[]) returns table (order_id uuid, meeting_id uuid, title text, starts_at timestamptz, duration_min int)
language sql stable security definer set search_path = public as $$
  select m.order_id, m.id, m.title, m.starts_at, m.duration_min
  from public.video_meetings m join public.houses h on h.id = m.house_id
  where auth.uid() is not null and m.kind = 'consulta' and m.status = 'agendada' and m.order_id = any(coalesce(p_orders, '{}'::uuid[]))
    and public.video_order_active(m.order_id)
    and m.starts_at + make_interval(mins => m.duration_min + 10) >= now()
    and (h.owner_id = auth.uid() or m.invitee_id = auth.uid())
  order by m.starts_at limit 200
$$;

revoke all on function public.video_order_active(uuid), public.video_order_closed(), public.video_order_meetings(uuid[]) from public, anon, authenticated;
grant execute on function public.video_order_meetings(uuid[]) to authenticated;
-- as funções redefinidas mantêm as permissões que já tinham

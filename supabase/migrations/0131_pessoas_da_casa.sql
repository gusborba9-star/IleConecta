-- 0131 — Pessoas da casa: CRM com linha do tempo e segmentos (Fase 5). SÓ LEITURA, sem tabela nova.
-- Blueprint §14: a pessoa é global; a relação com cada casa é isolada. A linha do tempo REFERENCIA os eventos originais
-- (seguir, conversa, pedido, reserva, mensalidade, avaliação, reembolso) e não copia nada.
--   * Só aparece quem tem relação real com a casa (seguiu, conversou, pediu, reservou ou é membro). Nenhuma busca em todos os perfis.
--   * Titular vê tudo da casa. Equipe vê só o que a permissão libera: seguidores e conversas (chat_read/chat_reply), pedidos e reservas (orders),
--     membros e mensalidades (members + plano com área de membros). Valores em dinheiro, avaliações e reembolsos: SÓ a titular.
--   * Nunca mostra texto de mensagem, bio, nem avaliação anônima. Pessoa bloqueada (por qualquer lado) some.
--   * Segmentos servem para ATENDER e acompanhar (finalidade do relacionamento). Não há exportação nem envio em massa.

-- ============ 1) base única: quem é a pessoa para esta casa ============
create or replace function public.house_people_base(p_house uuid, p_owner uuid, p_chat boolean, p_orders boolean, p_members boolean, p_money boolean)
returns table (person_id uuid, name text, avatar_url text, city text, state text,
               seguidor boolean, conversou boolean, interessado boolean, cliente boolean, recorrente boolean, participante boolean,
               membro boolean, pendencia boolean, sumido boolean, first_at timestamptz, last_at timestamptz, purchases integer, spent_cents bigint)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date d),
  ev as (
    select f.follower_id uid, 'seguidor'::text k, f.created_at a, f.created_at b, 0::bigint amt
      from public.follows f where p_chat and f.house_id = p_house
    union all
    select o.user_id, 'conversou', min(m.created_at), max(m.created_at), 0
      from public.conversation_members cm
      join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id <> cm.user_id
      join public.messages m on m.conversation_id = cm.conversation_id and m.sender_id = o.user_id
     where p_chat and cm.user_id = p_owner group by o.user_id
    union all
    select lm.sender_id, 'pend', lm.created_at, lm.created_at, 0
      from public.conversation_members cm
      join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id <> cm.user_id
      join lateral (select m.sender_id, m.created_at from public.messages m where m.conversation_id = cm.conversation_id and m.deleted_at is null order by m.created_at desc limit 1) lm on true
     where p_chat and cm.user_id = p_owner and lm.sender_id = o.user_id and lm.created_at > now() - interval '30 days'
    union all
    select s.client_id, case when s.status in ('confirmado', 'em_andamento', 'concluido') then 'compra' else 'interesse' end, s.created_at, s.created_at,
           case when s.status in ('confirmado', 'em_andamento', 'concluido') and p_money then s.price_cents else 0 end
      from public.service_orders s where p_orders and s.house_id = p_house and s.status <> 'reembolsado' and s.status <> 'reembolso_pendente'
    union all
    select s.client_id, 'pend', s.created_at, s.created_at, 0
      from public.service_orders s where p_orders and s.house_id = p_house and s.status = 'confirmado'
    union all
    select r.user_id, case when r.status = 'confirmada' then 'participacao' else 'interesse' end, r.created_at, r.created_at,
           case when r.status = 'confirmada' and p_money then e.price_cents else 0 end
      from public.reservations r join public.events e on e.id = r.event_id
     where p_orders and e.house_id = p_house and r.status in ('confirmada', 'aguardando_pagamento', 'expirada', 'cancelada')
    union all
    select hm.user_id, 'membro', hm.created_at, hm.created_at, 0
      from public.house_members hm where p_members and hm.house_id = p_house and hm.user_id is not null and hm.left_at is null
    union all
    select hm.user_id, 'pend', d.due_date::timestamptz, d.due_date::timestamptz, 0
      from public.member_dues d join public.house_members hm on hm.id = d.member_id, today
     where p_members and d.house_id = p_house and hm.user_id is not null and hm.left_at is null and d.status = 'aberta' and d.due_date < today.d
  ), agg as (
    select ev.uid,
           bool_or(k = 'seguidor') seguidor, bool_or(k = 'conversou') conversou,
           bool_or(k = 'interesse') had_interest, bool_or(k = 'membro') membro, bool_or(k = 'pend') pendencia,
           bool_or(k = 'participacao') participante,
           count(*) filter (where k in ('compra', 'participacao'))::int purchases,
           sum(amt) filter (where k in ('compra', 'participacao')) spent,
           min(a) first_at, max(b) last_at
      from ev group by ev.uid
  )
  select p.id, p.display_name, p.avatar_url, p.city, p.state,
         g.seguidor, g.conversou, (g.had_interest and g.purchases = 0), (g.purchases >= 1), (g.purchases >= 2), g.participante,
         g.membro, g.pendencia, (g.purchases >= 1 and g.last_at < now() - interval '90 days'),
         g.first_at, g.last_at, g.purchases, case when p_money then coalesce(g.spent, 0) else null end
    from agg g join public.profiles p on p.id = g.uid
   where g.uid is not null and g.uid <> p_owner
     and not exists (select 1 from public.house_staff hs where hs.house_id = p_house and hs.user_id = g.uid)
     and not exists (select 1 from public.user_blocks b where (b.blocker_id = p_owner and b.blocked_id = g.uid) or (b.blocker_id = g.uid and b.blocked_id = p_owner));
$$;

-- ============ 2) quem está logado: titular ou equipe, e o que pode ver ============
create or replace function public.house_people_ctx(out house_id uuid, out owner_id uuid, out titular boolean, out can_chat boolean, out can_orders boolean, out can_members boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_perms text[] := '{}'; v_plan text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select h.id, h.owner_id, h.plan::text into house_id, owner_id, v_plan from public.houses h where h.owner_id = v_uid order by h.created_at limit 1;
  if house_id is not null then titular := true;
  else
    titular := false;
    select s.house_id, s.perms into house_id, v_perms from public.staff_row() s limit 1;
    if house_id is null then raise exception 'not_house' using errcode = '42501'; end if;
    select h.owner_id, h.plan::text into owner_id, v_plan from public.houses h where h.id = house_id;
  end if;
  can_chat := titular or 'chat_read' = any (v_perms) or 'chat_reply' = any (v_perms);
  can_orders := titular or 'orders' = any (v_perms);
  can_members := public.plan_cap_bool(v_plan, 'members_area') and (titular or 'members' = any (v_perms));
  if not (can_chat or can_orders or can_members) then raise exception 'sem_permissao' using errcode = '42501'; end if;
end $$;

-- ============ 3) lista com segmentos ============
create or replace function public.house_people(p_segment text default 'todos', p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  x record; v_seg text := lower(coalesce(nullif(btrim(p_segment), ''), 'todos'));
  v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_lim int := least(greatest(coalesce(p_limit, 50), 1), 100); v_off int := greatest(coalesce(p_offset, 0), 0);
  res jsonb;
begin
  if v_seg not in ('todos', 'seguidor', 'conversou', 'interessado', 'cliente', 'recorrente', 'participante', 'membro', 'pendencia', 'sumido') then
    raise exception 'segmento_invalido' using errcode = '22023';
  end if;
  if v_q is not null and char_length(v_q) > 80 then v_q := left(v_q, 80); end if;
  select * into x from public.house_people_ctx();
  with b as (select * from public.house_people_base(x.house_id, x.owner_id, x.can_chat, x.can_orders, x.can_members, x.titular)),
  sel as (
    select b.* from b where case v_seg when 'todos' then true when 'seguidor' then b.seguidor when 'conversou' then b.conversou
      when 'interessado' then b.interessado when 'cliente' then b.cliente when 'recorrente' then b.recorrente when 'participante' then b.participante
      when 'membro' then b.membro when 'pendencia' then b.pendencia when 'sumido' then b.sumido else false end
      and (v_q is null or b.name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
  )
  select jsonb_build_object(
    'generated_at', now(), 'house_id', x.house_id, 'role', case when x.titular then 'titular' else 'equipe' end, 'segment', v_seg,
    'total', (select count(*) from sel),
    'counts', (select jsonb_build_object('todos', count(*), 'seguidor', count(*) filter (where seguidor), 'conversou', count(*) filter (where conversou),
        'interessado', count(*) filter (where interessado), 'cliente', count(*) filter (where cliente), 'recorrente', count(*) filter (where recorrente),
        'participante', count(*) filter (where participante), 'membro', count(*) filter (where membro), 'pendencia', count(*) filter (where pendencia),
        'sumido', count(*) filter (where sumido)) from b),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('person_id', s.person_id, 'name', s.name, 'avatar_url', s.avatar_url, 'city', s.city, 'state', s.state,
        'segments', (select coalesce(jsonb_agg(t.k), '[]'::jsonb) from (values (1, 'seguidor', s.seguidor), (2, 'conversou', s.conversou), (3, 'interessado', s.interessado),
            (4, 'cliente', s.cliente), (5, 'recorrente', s.recorrente), (6, 'participante', s.participante), (7, 'membro', s.membro), (8, 'pendencia', s.pendencia),
            (9, 'sumido', s.sumido)) as t(o, k, on_) where t.on_),
        'purchases', s.purchases, 'spent_cents', s.spent_cents, 'first_at', s.first_at, 'last_at', s.last_at) order by s.last_at desc nulls last, s.name, s.person_id), '[]'::jsonb)
      from (select * from sel order by last_at desc nulls last, name, person_id limit v_lim offset v_off) s),
    'scope', 'Só pessoas com relação real com a sua casa. Lê as tabelas originais na hora; não guarda cópia. Para atender e acompanhar, não para envio em massa.')
  into res;
  return res;
end $$;

-- ============ 4) linha do tempo de UMA pessoa nesta casa ============
create or replace function public.house_person_timeline(p_person uuid, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  x record; b record; v_lim int := least(greatest(coalesce(p_limit, 100), 1), 200); res jsonb;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into x from public.house_people_ctx();
  if p_person is null then raise exception 'not_related' using errcode = 'P0002'; end if;
  select * into b from public.house_people_base(x.house_id, x.owner_id, x.can_chat, x.can_orders, x.can_members, x.titular) where person_id = p_person;
  if b.person_id is null then raise exception 'not_related' using errcode = 'P0002'; end if;
  with ev as (
    select f.created_at at, 'seguiu'::text kind, f.house_id ref_id, 'Passou a seguir a casa'::text title, null::text detail
      from public.follows f where x.can_chat and f.house_id = x.house_id and f.follower_id = p_person
    union all
    select c.created_at, 'conversa', c.id, 'Conversa iniciada', null
      from public.conversations c join public.conversation_members a on a.conversation_id = c.id and a.user_id = x.owner_id
      join public.conversation_members o on o.conversation_id = c.id and o.user_id = p_person
     where x.can_chat
    union all
    select m.at, 'mensagem', m.cid, 'Última mensagem da pessoa', null
      from (select cm.conversation_id cid, max(s.created_at) at
              from public.conversation_members cm join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id = p_person
              join public.messages s on s.conversation_id = cm.conversation_id and s.sender_id = p_person
             where x.can_chat and cm.user_id = x.owner_id group by cm.conversation_id) m
    union all
    select e.created_at, 'assistente_' || e.action, e.conversation_id,
           case e.action when 'passada_para_casa' then 'Assistente passou o assunto para a casa' when 'assumida' then 'A casa assumiu a conversa' else 'Conversa devolvida à assistente' end, null
      from public.handoff_events e
      join public.conversation_members o on o.conversation_id = e.conversation_id and o.user_id = p_person
     where x.can_chat and e.house_owner_id = x.owner_id
    union all
    select s.created_at, 'pedido', s.id, left(s.title, 120), s.status
      from public.service_orders s where x.can_orders and s.house_id = x.house_id and s.client_id = p_person
    union all
    select s.finished_at, 'pedido_concluido', s.id, 'Concluído: ' || left(s.title, 100), s.status
      from public.service_orders s where x.can_orders and s.house_id = x.house_id and s.client_id = p_person and s.finished_at is not null
    union all
    select r.created_at, 'reserva', r.id, left(e.title, 120), r.status::text
      from public.reservations r join public.events e on e.id = r.event_id
     where x.can_orders and e.house_id = x.house_id and r.user_id = p_person
    union all
    select hm.created_at, 'membro', hm.id, 'Passou a ser membro', null
      from public.house_members hm where x.can_members and hm.house_id = x.house_id and hm.user_id = p_person and hm.left_at is null
    union all
    select hm.left_at, 'membro_saiu', hm.id, 'Saiu da lista de membros', hm.left_by
      from public.house_members hm where x.can_members and hm.house_id = x.house_id and hm.user_id = p_person and hm.left_at is not null
    union all
    select coalesce(d.paid_at, d.due_date::timestamptz), 'mensalidade', d.id,
           case d.status when 'paga' then 'Mensalidade paga' when 'dispensada' then 'Mensalidade dispensada' when 'aberta' then case when d.due_date < v_today then 'Mensalidade vencida' else 'Mensalidade a vencer' end end,
           d.status
      from public.member_dues d join public.house_members hm on hm.id = d.member_id
     where x.can_members and d.house_id = x.house_id and hm.user_id = p_person
    union all
    select r.created_at, 'avaliacao', r.id, 'Avaliou a casa: ' || r.rating || case when r.rating = 1 then ' estrela' else ' estrelas' end, null
      from public.reviews r where x.titular and r.house_id = x.house_id and r.author_id = p_person and not r.anonymous
    union all
    select q.created_at, 'reembolso', q.id, 'Pediu reembolso', q.status
      from public.refund_requests q where x.titular and q.house_id = x.house_id and q.client_id = p_person
  )
  select jsonb_build_object(
    'generated_at', now(), 'house_id', x.house_id, 'role', case when x.titular then 'titular' else 'equipe' end,
    'person', jsonb_build_object('person_id', b.person_id, 'name', b.name, 'avatar_url', b.avatar_url, 'city', b.city, 'state', b.state,
        'segments', (select coalesce(jsonb_agg(t.k), '[]'::jsonb) from (values (1, 'seguidor', b.seguidor), (2, 'conversou', b.conversou), (3, 'interessado', b.interessado),
            (4, 'cliente', b.cliente), (5, 'recorrente', b.recorrente), (6, 'participante', b.participante), (7, 'membro', b.membro), (8, 'pendencia', b.pendencia),
            (9, 'sumido', b.sumido)) as t(o, k, on_) where t.on_),
        'purchases', b.purchases, 'spent_cents', b.spent_cents, 'first_at', b.first_at, 'last_at', b.last_at),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'ref_id', e.ref_id, 'title', e.title, 'detail', e.detail) order by e.at desc, e.kind), '[]'::jsonb)
      from (select * from ev where at is not null order by at desc, kind limit v_lim) e),
    'scope', 'Referencia os registros originais; não guarda cópia. Não mostra o texto das mensagens.')
  into res;
  return res;
end $$;

-- ============ 5) permissões ============
revoke all on function public.house_people_base(uuid, uuid, boolean, boolean, boolean, boolean), public.house_people_ctx(), public.house_people(text, text, integer, integer), public.house_person_timeline(uuid, integer) from public, anon, authenticated;
grant execute on function public.house_people(text, text, integer, integer), public.house_person_timeline(uuid, integer) to authenticated;

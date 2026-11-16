-- PASSO 286: 0131_pessoas_da_casa — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

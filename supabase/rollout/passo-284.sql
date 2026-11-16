-- PASSO 284: 0131_pessoas_da_casa — parte 1 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

-- Fechada já aqui, no mesmo passo em que nasce: recebe a casa por parâmetro e só pode ser chamada pelas funções abaixo.
revoke all on function public.house_people_base(uuid, uuid, boolean, boolean, boolean, boolean) from public, anon, authenticated;

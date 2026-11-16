-- 0132 — Indicadores da casa (Fase 5). SÓ LEITURA, sem tabela nova.
-- Blueprint §28.1: números do atendimento e das vendas da casa, com o período anterior ao lado para comparar.
-- Cada indicador tem definição e origem escritas na tela (src/lib/houseIndicatorsCore.js); aqui só se calcula, lendo as tabelas originais na hora.
--   * Titular vê tudo. Equipe só com a permissão "stats" (indicadores), e nunca vê dinheiro, reembolsos nem avaliações.
--   * Períodos: 7, 30 ou 90 dias. "Anterior" é o período de mesmo tamanho logo antes.
--   * Indicadores de pedidos contam pelos pedidos CRIADOS no período e pelo estado em que estão hoje.

create or replace function public.house_indicators(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_house uuid; v_owner uuid; v_titular boolean := false; v_perms text[] := '{}';
  v_days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  w_cur jsonb; w_prev jsonb; a timestamptz; b timestamptz; i int;
  r jsonb := '[]'::jsonb; res jsonb; snap jsonb;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select h.id, h.owner_id into v_house, v_owner from public.houses h where h.owner_id = v_uid order by h.created_at limit 1;
  if v_house is not null then v_titular := true;
  else
    select s.house_id, s.perms into v_house, v_perms from public.staff_row() s limit 1;
    if v_house is null then raise exception 'not_house' using errcode = '42501'; end if;
    select h.owner_id into v_owner from public.houses h where h.id = v_house;
    if not ('stats' = any (v_perms)) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  end if;

  -- uma janela por vez: i = 1 período atual, i = 2 período anterior
  for i in 1..2 loop
    b := now() - make_interval(days => v_days * (i - 1));
    a := b - make_interval(days => v_days);
    r := r || jsonb_build_array(jsonb_build_object(
      'novos_seguidores', (select count(*) from public.follows f where f.house_id = v_house and f.created_at >= a and f.created_at < b),
      'pessoas_que_falaram', (select count(distinct m.sender_id) from public.messages m
          join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = v_owner
         where m.sender_id <> v_owner and not m.from_assistant and m.created_at >= a and m.created_at < b),
      -- cada vez que a pessoa escreve depois de a casa ter falado (ou no início da conversa), conta o tempo até a casa (ou a assistente) responder
      'tempo_resposta_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from (rp.at - q.created_at)) / 60))::numeric, 1)
          from public.messages q
          join public.conversation_members cm on cm.conversation_id = q.conversation_id and cm.user_id = v_owner
          left join lateral (select p0.sender_id from public.messages p0 where p0.conversation_id = q.conversation_id and p0.deleted_at is null and (p0.created_at, p0.id) < (q.created_at, q.id) order by p0.created_at desc, p0.id desc limit 1) pv on true
          join lateral (select min(r2.created_at) at from public.messages r2 where r2.conversation_id = q.conversation_id and r2.sender_id = v_owner and r2.created_at > q.created_at) rp on rp.at is not null
         where q.created_at >= a and q.created_at < b and q.deleted_at is null and q.sender_id <> v_owner and not q.from_assistant
           and (pv.sender_id is null or pv.sender_id = v_owner)),
      'pedidos_criados', (select count(*) from public.service_orders o where o.house_id = v_house and o.created_at >= a and o.created_at < b),
      'pedidos_pagos', (select count(*) from public.service_orders o where o.house_id = v_house and o.created_at >= a and o.created_at < b and o.status in ('confirmado', 'em_andamento', 'concluido')),
      'pedidos_perdidos', (select count(*) from public.service_orders o where o.house_id = v_house and o.created_at >= a and o.created_at < b and o.status in ('cancelado', 'expirado')),
      'reservas_confirmadas', (select count(*) from public.reservations x join public.events e on e.id = x.event_id where e.house_id = v_house and x.created_at >= a and x.created_at < b and x.status = 'confirmada'),
      'reservas_canceladas', (select count(*) from public.reservations x join public.events e on e.id = x.event_id where e.house_id = v_house and x.created_at >= a and x.created_at < b and x.status in ('cancelada', 'expirada')),
      'clientes_no_periodo', (select count(distinct c) from (
            select o.client_id c from public.service_orders o where o.house_id = v_house and o.created_at >= a and o.created_at < b and o.status in ('confirmado', 'em_andamento', 'concluido')
            union select x.user_id from public.reservations x join public.events e on e.id = x.event_id where e.house_id = v_house and x.created_at >= a and x.created_at < b and x.status = 'confirmada') t),
      'clientes_que_voltaram', (select count(distinct c) from (
            select o.client_id c from public.service_orders o where o.house_id = v_house and o.created_at >= a and o.created_at < b and o.status in ('confirmado', 'em_andamento', 'concluido')
            union select x.user_id from public.reservations x join public.events e on e.id = x.event_id where e.house_id = v_house and x.created_at >= a and x.created_at < b and x.status = 'confirmada') t
          where exists (select 1 from public.service_orders o2 where o2.house_id = v_house and o2.client_id = t.c and o2.created_at < a and o2.status in ('confirmado', 'em_andamento', 'concluido', 'reembolsado'))
             or exists (select 1 from public.reservations x2 join public.events e2 on e2.id = x2.event_id where e2.house_id = v_house and x2.user_id = t.c and x2.created_at < a and x2.status in ('confirmada', 'reembolsada'))),
      -- dinheiro: só a titular (a equipe nunca vê)
      'volume_cents', case when v_titular then
          coalesce((select sum(o.price_cents) from public.service_orders o where o.house_id = v_house and o.created_at >= a and o.created_at < b and o.status in ('confirmado', 'em_andamento', 'concluido')), 0)
        + coalesce((select sum(e.price_cents) from public.reservations x join public.events e on e.id = x.event_id where e.house_id = v_house and x.created_at >= a and x.created_at < b and x.status = 'confirmada'), 0)
        else null end,
      'reembolsos', case when v_titular then (select count(*) from public.refund_requests q where q.house_id = v_house and q.created_at >= a and q.created_at < b) else null end,
      'avaliacoes', case when v_titular then (select count(*) from public.reviews rv where rv.house_id = v_house and rv.created_at >= a and rv.created_at < b and not rv.hidden) else null end,
      'nota_media', case when v_titular then (select round(avg(rv.rating)::numeric, 2) from public.reviews rv where rv.house_id = v_house and rv.created_at >= a and rv.created_at < b and not rv.hidden) else null end
    ));
  end loop;
  w_cur := r -> 0; w_prev := r -> 1;

  -- números do momento (sem comparação com o período anterior)
  snap := jsonb_build_object(
    'seguidores_total', (select count(*) from public.follows f where f.house_id = v_house),
    'ocupacao_pct', (select case when sum(e.seats_total) > 0 then round(100.0 * sum(least(t.n, e.seats_total)) / sum(e.seats_total), 1) end
        from public.events e
        left join lateral (select count(*) n from public.reservations x where x.event_id = e.id and x.status = 'confirmada') t on true
       where e.house_id = v_house and e.status = 'publicado' and e.starts_at >= now() and e.starts_at < now() + interval '30 days'),
    'avaliacoes_sem_resposta', case when v_titular then (select count(*) from public.reviews rv where rv.house_id = v_house and rv.reply is null and not rv.hidden) else null end
  );

  res := jsonb_build_object('generated_at', now(), 'days', v_days, 'role', case when v_titular then 'titular' else 'equipe' end,
    'since', now() - make_interval(days => v_days), 'previous_since', now() - make_interval(days => v_days * 2),
    'metrics', (select jsonb_object_agg(e.key, jsonb_build_object('current', e.value, 'previous', w_prev -> e.key)) from jsonb_each(w_cur) e),
    'snapshot', snap,
    'scope', 'Só da sua casa. Lê as tabelas originais na hora; não guarda cópia.');
  return res;
end $$;

revoke all on function public.house_indicators(integer) from public, anon, authenticated;
grant execute on function public.house_indicators(integer) to authenticated;

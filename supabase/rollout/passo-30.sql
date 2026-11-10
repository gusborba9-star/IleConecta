-- PASSO 30 de 30: 0071 — F4: relatório da casa e limpeza de 12 meses
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 11) Relatório da casa: passagens contadas pelo registro (mesma função da 0035, só a linha de 'handoffs' muda).
-- Relatório da casa (só a dona): só números reais do banco.
create or replace function public.house_assistant_report(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hid uuid; hplan text; since timestamptz; day24 timestamptz := now() - interval '24 hours';
  uid uuid := auth.uid();
  res jsonb;
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;
  p_days := least(greatest(coalesce(p_days, 7), 1), 90);
  since := now() - make_interval(days => p_days);
  select h.id, h.plan::text into hid, hplan from public.houses h where h.owner_id = uid;
  if hid is null then raise exception 'Somente a casa vê este relatório.' using errcode = '42501'; end if;

  select jsonb_build_object(
    'days', p_days,
    'plan', hplan,
    'assistant_replies', (select count(*) from public.assistant_usage u where u.house_id = hid and u.created_at >= since),
    'clients_attended', (select count(distinct u.user_id) from public.assistant_usage u where u.house_id = hid and u.created_at >= since),
    -- Passagens para a casa: registro próprio (0071); avisos antigos, de antes do registro, seguem contados pelo texto.
    'handoffs', (select count(*) from public.handoff_events e where e.house_owner_id = uid and e.action = 'passada_para_casa' and e.created_at >= since)
              + (select count(*) from public.notifications n where n.user_id = uid and n.kind is null and n.text like '%precisa de você:%' and n.created_at >= since),
    -- Clientes que escreveram à noite (22h–7h, Brasília), com a casa ou com a assistente.
    'night_contacts', (select count(distinct m.sender_id) from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
        where m.from_assistant = false and m.sender_id <> uid and m.created_at >= since
          and (extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) >= 22 or extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) < 7)),
    'night_contacts_24h', (select count(distinct m.sender_id) from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
        where m.from_assistant = false and m.sender_id <> uid and m.created_at >= day24
          and (extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) >= 22 or extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) < 7)),
    'contacts_24h', (select count(distinct m.sender_id) from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
        where m.from_assistant = false and m.sender_id <> uid and m.created_at >= day24),
    -- Pedidos e vagas de quem conversou com a assistente nos 7 dias anteriores ("após conversar", não "fechado pela assistente").
    'orders_after_chat', (select count(*) from public.service_orders o
        where o.house_id = hid and o.created_at >= since and o.status::text not in ('cancelado', 'expirado')
          and exists (select 1 from public.assistant_usage u where u.house_id = hid and u.user_id = o.client_id and u.created_at between o.created_at - interval '7 days' and o.created_at)),
    'orders_after_chat_cents', (select coalesce(sum(o.price_cents), 0) from public.service_orders o
        where o.house_id = hid and o.created_at >= since and o.status::text not in ('cancelado', 'expirado')
          and exists (select 1 from public.assistant_usage u where u.house_id = hid and u.user_id = o.client_id and u.created_at between o.created_at - interval '7 days' and o.created_at)),
    'seats_after_chat', (select count(*) from public.reservations r join public.events e on e.id = r.event_id
        where e.house_id = hid and r.created_at >= since and r.status::text not in ('cancelada', 'expirada')
          and exists (select 1 from public.assistant_usage u where u.house_id = hid and u.user_id = r.user_id and u.created_at between r.created_at - interval '7 days' and r.created_at)),
    -- Respostas da assistente por hora do dia (Brasília): mostra em que horário ela mais atendeu.
    'replies_by_hour', (select coalesce(jsonb_agg(coalesce(x.n, 0) order by g.h), '[]'::jsonb)
        from generate_series(0, 23) g(h)
        left join (select extract(hour from (u.created_at at time zone 'America/Sao_Paulo'))::int h, count(*) n
                     from public.assistant_usage u where u.house_id = hid and u.created_at >= since group by 1) x on x.h = g.h)
  ) into res;
  return res;
end $$;
revoke all on function public.house_assistant_report(integer) from public, anon;
grant execute on function public.house_assistant_report(integer) to authenticated;

-- 12) Retenção dos eventos: 12 meses.
do $$
begin
  perform cron.schedule('purge-handoff-events', '50 3 * * *', 'delete from public.handoff_events where created_at < now() - interval ''12 months''');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

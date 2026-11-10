-- 0071 — F4 da auditoria 31.3: estado de responsável no atendimento (Blueprint §13: "automação não disputa conversa com atendente humano").
-- Antes: nada registrava "quem está com a conversa". Com a casa offline, a assistente respondia mesmo depois de a casa ou a equipe já ter
-- respondido, e o aviso "precisa de você" era contado/identificado por busca no texto (frágil).
-- Agora cada conversa tem um estado persistente:
--   'automacao' — a assistente pode responder (padrão; também depois de "devolver à assistente");
--   'pendente'  — a assistente passou a conversa para a casa e ninguém assumiu ainda;
--   'humano'    — a casa ou alguém da equipe respondeu (ou assumiu): a assistente não responde.
-- 'pendente' e 'humano' vencem sozinhos após 12 horas sem atividade humana (o cliente nunca fica sem resposta para sempre).
-- Também: aviso do "precisa de você" identificado por coluna (notifications.kind) e relatório contado por registro próprio.
-- Idempotente: pode rodar mais de uma vez.

-- 1) Identificação do aviso de passagem de atendimento (substitui a busca por texto).
alter table public.notifications add column if not exists kind text;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind is null or kind in ('handoff'));

-- 2) Estado por conversa.
create table if not exists public.conversation_handoff (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  house_owner_id uuid not null,
  state text not null check (state in ('automacao', 'pendente', 'humano')),
  handler_name text check (handler_name is null or char_length(handler_name) <= 60),
  reason text check (reason is null or char_length(reason) <= 200),
  since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversation_handoff enable row level security;
revoke all on table public.conversation_handoff from public, anon, authenticated;
-- Sem política de leitura direta: o app lê pela função conversation_handoff_state (que confere quem pode ver).

-- 3) Registro dos eventos (alimenta o relatório da casa; só serviço e funções internas escrevem).
create table if not exists public.handoff_events (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  house_owner_id uuid not null,
  action text not null check (action in ('passada_para_casa', 'assumida', 'devolvida')),
  created_at timestamptz not null default now()
);
create index if not exists handoff_events_house_idx on public.handoff_events (house_owner_id, created_at desc);
create index if not exists handoff_events_conv_idx on public.handoff_events (conversation_id, action, created_at desc);
alter table public.handoff_events enable row level security;
revoke all on table public.handoff_events from public, anon, authenticated;

-- 4) A assistente pode responder nesta conversa? (só o servico da assistente chama)
create or replace function public.handoff_allows_assistant(p_conv uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.conversation_handoff h
    where h.conversation_id = p_conv and h.house_owner_id = p_owner
      and h.state in ('pendente', 'humano') and h.updated_at > now() - interval '12 hours'
  );
$$;
revoke all on function public.handoff_allows_assistant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.handoff_allows_assistant(uuid, uuid) to service_role;

-- 5) A assistente passou a conversa para a casa. Devolve true quando o aviso deve ser enviado (no máximo 1 a cada 30 minutos por conversa).
create or replace function public.handoff_mark_pending(p_conv uuid, p_owner uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_notify boolean;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = p_owner) then
    raise exception 'Conversa da casa não encontrada.';
  end if;
  insert into public.conversation_handoff (conversation_id, house_owner_id, state, reason, handler_name, since, updated_at)
  values (p_conv, p_owner, 'pendente', nullif(left(btrim(coalesce(p_reason, '')), 200), ''), null, now(), now())
  on conflict (conversation_id) do update
    set house_owner_id = excluded.house_owner_id, state = 'pendente', reason = excluded.reason, handler_name = null,
        since = case when public.conversation_handoff.state = 'pendente' and public.conversation_handoff.house_owner_id = excluded.house_owner_id
                     then public.conversation_handoff.since else now() end,
        updated_at = now();
  -- a linha acima trava a conversa até o fim da transação: duas passagens simultâneas não avisam duas vezes
  v_notify := not exists (
    select 1 from public.handoff_events e
    where e.conversation_id = p_conv and e.action = 'passada_para_casa' and e.created_at > now() - interval '30 minutes');
  insert into public.handoff_events (conversation_id, house_owner_id, action) values (p_conv, p_owner, 'passada_para_casa');
  return v_notify;
end $$;
revoke all on function public.handoff_mark_pending(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.handoff_mark_pending(uuid, uuid, text) to service_role;

-- 6) A casa ou a equipe respondeu: a conversa passa a ser humana.
create or replace function public.trg_messages_handoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text; v_prev_owner uuid;
begin
  if new.from_assistant then return null; end if;
  -- só conta quem é dono de casa (a equipe grava com o id do dono); mensagem de cliente não muda o estado
  if not exists (select 1 from public.houses where owner_id = new.sender_id) then return null; end if;
  select state, house_owner_id into v_prev, v_prev_owner from public.conversation_handoff where conversation_id = new.conversation_id;
  insert into public.conversation_handoff (conversation_id, house_owner_id, state, handler_name, reason, since, updated_at)
  values (new.conversation_id, new.sender_id, 'humano', nullif(left(btrim(coalesce(new.staff_name, '')), 60), ''), null, now(), now())
  on conflict (conversation_id) do update
    set house_owner_id = excluded.house_owner_id, state = 'humano', handler_name = excluded.handler_name, reason = null,
        since = case when public.conversation_handoff.state = 'humano' and public.conversation_handoff.house_owner_id = excluded.house_owner_id
                     then public.conversation_handoff.since else now() end,
        updated_at = now();
  if v_prev is distinct from 'humano' or v_prev_owner is distinct from new.sender_id then
    insert into public.handoff_events (conversation_id, house_owner_id, action) values (new.conversation_id, new.sender_id, 'assumida');
  end if;
  return null;
end $$;
revoke all on function public.trg_messages_handoff() from public, anon, authenticated;
drop trigger if exists trg_messages_handoff on public.messages;
create trigger trg_messages_handoff after insert on public.messages
  for each row execute function public.trg_messages_handoff();

-- 7) Quem pode agir pela casa nesta conversa: o dono (se for membro) ou a equipe com permissão de responder. Devolve (dono, nome da equipe).
create or replace function public.handoff_actor(p_conv uuid, out o_owner uuid, out o_name text)
language plpgsql stable security definer set search_path = public as $$
declare s public.house_staff;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if exists (select 1 from public.houses h join public.conversation_members cm on cm.user_id = h.owner_id
             where h.owner_id = auth.uid() and cm.conversation_id = p_conv) then
    o_owner := auth.uid(); o_name := null; return;
  end if;
  if public.staff_perm('chat_reply') is not null and public.staff_can_see_conversation(p_conv) then
    select * into s from public.staff_row();
    select h.owner_id into o_owner from public.houses h where h.id = s.house_id;
    o_name := s.name; return;
  end if;
  raise exception 'Conversa indisponível.' using errcode = '42501';
end $$;
revoke all on function public.handoff_actor(uuid) from public, anon, authenticated;

-- 8) Estado visível a quem participa (cliente, dono) ou à equipe que enxerga a conversa.
create or replace function public.conversation_handoff_state(p_conv uuid)
returns table (state text, handler_name text, since timestamptz, active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if not (public.is_conversation_member(p_conv) or (public.staff_perm('chat_read') is not null and public.staff_can_see_conversation(p_conv))) then
    raise exception 'Conversa indisponível.' using errcode = '42501';
  end if;
  return query
    select h.state, h.handler_name, h.since, (h.state in ('pendente', 'humano') and h.updated_at > now() - interval '12 hours')
    from public.conversation_handoff h where h.conversation_id = p_conv;
  if not found then return query select 'automacao'::text, null::text, null::timestamptz, false; end if;
end $$;
revoke all on function public.conversation_handoff_state(uuid) from public, anon;
grant execute on function public.conversation_handoff_state(uuid) to authenticated;

-- 9) Assumir (a assistente para de responder) e devolver à assistente.
create or replace function public.handoff_take(p_conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; v_prev text;
begin
  select * into a from public.handoff_actor(p_conv);
  select state into v_prev from public.conversation_handoff where conversation_id = p_conv and house_owner_id = a.o_owner;
  insert into public.conversation_handoff (conversation_id, house_owner_id, state, handler_name, since, updated_at)
  values (p_conv, a.o_owner, 'humano', a.o_name, now(), now())
  on conflict (conversation_id) do update
    set house_owner_id = excluded.house_owner_id, state = 'humano', handler_name = excluded.handler_name, reason = null,
        since = case when public.conversation_handoff.state = 'humano' and public.conversation_handoff.house_owner_id = excluded.house_owner_id
                     then public.conversation_handoff.since else now() end,
        updated_at = now();
  if v_prev is distinct from 'humano' then
    insert into public.handoff_events (conversation_id, house_owner_id, action) values (p_conv, a.o_owner, 'assumida');
  end if;
end $$;
revoke all on function public.handoff_take(uuid) from public, anon;
grant execute on function public.handoff_take(uuid) to authenticated;

create or replace function public.handoff_release(p_conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; v_n int;
begin
  select * into a from public.handoff_actor(p_conv);
  update public.conversation_handoff
     set state = 'automacao', handler_name = null, reason = null, since = now(), updated_at = now()
   where conversation_id = p_conv and house_owner_id = a.o_owner and state <> 'automacao';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.handoff_events (conversation_id, house_owner_id, action) values (p_conv, a.o_owner, 'devolvida');
  end if;
end $$;
revoke all on function public.handoff_release(uuid) from public, anon;
grant execute on function public.handoff_release(uuid) to authenticated;

-- 10) Aviso no celular: "precisa de você" continua furando o "Não perturbe", agora identificado pela coluna (e, para avisos antigos, pelo texto).
create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path to 'public', 'vault', 'net' as $$
declare
  secret text;
  q public.notification_prefs%rowtype;
  h int;
  in_quiet boolean;
  hide boolean := false;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then return new; end if;
  select * into q from public.notification_prefs where user_id = new.user_id;
  if found then hide := q.discreet; end if;
  if found and q.quiet_on and not (coalesce(new.kind, '') = 'handoff' or (new.kind is null and new.text like '%precisa de você:%')) then
    h := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
    in_quiet := case when q.quiet_start < q.quiet_end then h >= q.quiet_start and h < q.quiet_end
                     when q.quiet_start > q.quiet_end then h >= q.quiet_start or h < q.quiet_end
                     else false end;
    if in_quiet then return new; end if;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  perform net.http_post(
    url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')),
    body := jsonb_build_object('user_id', new.user_id, 'text', case when hide then 'Você tem uma novidade.' else new.text end, 'href', new.href, 'discreet', hide));
  return new;
exception when others then
  return new;
end $$;

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

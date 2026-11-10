-- 0067 — EXEC-02: correções da auditoria §31.3 (F1, F2, F3, F7, F11, F12). Idempotente (create or replace / if not exists).
-- NÃO aplicada em produção: depende de autorização expressa. Ver docs/governanca/AUDITORIA_31_3_RECONCILIACOES.md.
--  F1  convite da equipe: aceite serializado (um convite = um vínculo) e trava da casa ao contar acessos.
--  F3  reservas e fila de espera de ritual encerram 1 hora antes do início (Blueprint §10.2).
--  F2  perfis: só casas são públicas; pessoas só para quem tem relação; curtidas só a contagem (quem curtiu: a dona da publicação).
--  F7  ritual com duração prevista ocupa a agenda de atendimentos da casa; conflito é recusado de forma transacional.
--  F11 funções sem search_path fixo; F12 forma eficiente de auth.uid() em RLS (mesma regra).

-- ============ F1) convite da equipe ============
CREATE OR REPLACE FUNCTION public.accept_staff_invite(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.house_staff_invites; h public.houses;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar.'; end if;
  select * into i from public.house_staff_invites where token = p_token and used_at is null and expires_at > now() for update;
  if i.token is null then raise exception 'Este convite expirou ou já foi usado.'; end if;
  -- serializa por casa: a contagem de acessos não corre contra outro aceite
  select * into h from public.houses where id = i.house_id for update;
  if h.owner_id = auth.uid() then raise exception 'Este é o convite da sua própria casa.'; end if;
  if (select count(*) from public.house_staff where house_id = h.id) >= public.house_seat_allowance(h.id) then raise exception 'A casa não tem acesso disponível agora.'; end if;
  if exists (select 1 from public.houses where owner_id = auth.uid()) then raise exception 'Use uma conta de cliente para atender pela casa.'; end if;
  if exists (select 1 from public.house_staff where user_id = auth.uid()) then raise exception 'Você já atende por uma casa.'; end if;
  insert into public.house_staff (house_id, user_id, name, perms) values (i.house_id, auth.uid(), i.name, i.perms);
  update public.house_staff_invites set used_at = now() where token = p_token;
  return h.name;
exception when unique_violation then
  raise exception 'Você já atende por uma casa.';
end $function$;

CREATE OR REPLACE FUNCTION public.staff_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  -- serializa a criação de convites da mesma casa (a contagem não corre contra outro convite)
  perform 1 from public.houses where id = new.house_id for update;
  select (select count(*) from public.house_staff where house_id = new.house_id)
       + (select count(*) from public.house_staff_invites where house_id = new.house_id and used_at is null and expires_at > now())
    into n;
  if n >= public.house_seat_allowance(new.house_id) then
    raise exception 'O seu plano não tem acesso disponível. Contrate um acesso extra.';
  end if;
  return new;
end $function$;

-- ============ F3) janela de 1 hora ============
CREATE OR REPLACE FUNCTION public.reserve_event(p_event uuid, p_answers jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.events%rowtype;
  fld jsonb;
  v text;
  rid uuid;
  paid boolean;
  owner uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para reservar.'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found or ev.status <> 'publicado' then raise exception 'Este ritual não está disponível.'; end if;
  if ev.started_at is not null or ev.starts_at <= now() + interval '1 hour' then raise exception 'As reservas deste ritual encerram 1 hora antes do início.'; end if;
  if public.is_house_owner(ev.house_id) then raise exception 'A casa não reserva vaga no próprio ritual.'; end if;

  update public.reservations set status = 'expirada'
    where event_id = p_event and status = 'aguardando_pagamento' and expires_at <= now();
  update public.payments p set status = 'falhou'
    where p.status = 'pendente' and exists (
      select 1 from public.reservations r where r.id = p.reservation_id and r.event_id = p_event and r.status = 'expirada');

  if public.event_taken(p_event) >= ev.seats_total then raise exception 'Vagas esgotadas.'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Respostas inválidas.'; end if;
  for fld in select * from jsonb_array_elements(ev.intake_fields) loop
    v := btrim(coalesce(p_answers ->> (fld ->> 'id'), ''));
    if coalesce((fld ->> 'required')::boolean, false) and v = '' then
      raise exception 'Preencha: %', fld ->> 'label';
    end if;
    if char_length(v) > 500 then raise exception 'Resposta muito longa: %', fld ->> 'label'; end if;
  end loop;

  select h.owner_id into owner from public.houses h where h.id = ev.house_id;
  paid := ev.price_cents > 0 and public.payments_enabled(owner);
  if paid then
    if ev.starts_at > now() + interval '30 days' then
      raise exception 'As reservas pagas deste ritual abrem 30 dias antes da data.';
    end if;
    if ev.price_cents > public.payment_max_cents() then
      raise exception 'Este valor passa do limite para pagamento pela plataforma. Combine direto com a casa.';
    end if;
    if not public.house_accepted_terms(owner) then raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.'; end if;
    if not exists (select 1 from public.house_payment_accounts a where a.owner_id = owner and a.charges_enabled) then
      raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.';
    end if;
    if not public.has_client_terms(auth.uid()) or not public.has_recent_consent(auth.uid(), 'dados_sensiveis') then
      raise exception 'Aceite as condições da reserva para continuar.';
    end if;
  end if;
  insert into public.reservations (event_id, user_id, status, expires_at, answers)
  values (p_event, auth.uid(),
          case when paid then 'aguardando_pagamento'::reservation_status else 'confirmada'::reservation_status end,
          case when paid then now() + interval '15 minutes' else now() end,
          (select coalesce(jsonb_object_agg(x ->> 'id', btrim(coalesce(p_answers ->> (x ->> 'id'), ''))), '{}'::jsonb)
             from jsonb_array_elements(ev.intake_fields) as x))
  returning id into rid;

  if paid then
    insert into public.payments (reservation_id, provider, gross_cents, status, fee_rule_version, fee_cents)
    values (rid, 'stripe', ev.price_cents, 'pendente', 'v2-2026-10', public.fee_cents(ev.price_cents, 'ritual'));
  end if;
  return rid;
exception when unique_violation then
  raise exception 'Você já tem vaga neste ritual.';
end $function$;

CREATE OR REPLACE FUNCTION public.join_event_waitlist(p_event uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.events%rowtype;
  owner uuid;
  cname text;
  added integer;
  pos integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para entrar na fila.'; end if;
  select * into ev from public.events where id = p_event;
  if not found or ev.status <> 'publicado' or ev.starts_at <= now() + interval '1 hour' or ev.started_at is not null then
    raise exception 'Este ritual não está aberto para a fila de espera.';
  end if;
  if public.is_house_owner(ev.house_id) then raise exception 'A casa não entra na própria fila.'; end if;
  if public.event_taken(p_event) < ev.seats_total then raise exception 'Ainda há vagas: reserve a sua agora.'; end if;
  if exists (select 1 from public.reservations r where r.event_id = p_event and r.user_id = auth.uid()
              and (r.status = 'confirmada' or (r.status = 'aguardando_pagamento' and r.expires_at > now()))) then
    raise exception 'Você já tem vaga neste ritual.';
  end if;
  insert into public.event_waitlist (event_id, user_id) values (p_event, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    select h.owner_id into owner from public.houses h where h.id = ev.house_id;
    select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = auth.uid();
    insert into public.notifications (user_id, text, href)
      values (owner, cname || ' entrou na fila de espera: ' || ev.title || '.', '/casa/' || owner || '?aba=rituais');
  end if;
  select count(*)::int into pos from public.event_waitlist w
   where w.event_id = p_event and w.created_at <= (select created_at from public.event_waitlist where event_id = p_event and user_id = auth.uid());
  return pos;
end $function$;

CREATE OR REPLACE FUNCTION public.notify_waitlist_on_free_seat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.events%rowtype;
  owner uuid;
  free integer;
  w record;
begin
  if old.status in ('confirmada', 'aguardando_pagamento') and new.status in ('cancelada', 'expirada', 'reembolso_pendente') then
    select * into ev from public.events where id = new.event_id;
    if not found or ev.status <> 'publicado' or ev.starts_at <= now() + interval '1 hour' or ev.started_at is not null then return new; end if;
    free := ev.seats_total - public.event_taken(ev.id);
    if free <= 0 then return new; end if;
    select h.owner_id into owner from public.houses h where h.id = ev.house_id;
    for w in
      select id, user_id from public.event_waitlist
       where event_id = ev.id and notified_at is null order by created_at limit free
    loop
      update public.event_waitlist set notified_at = now() where id = w.id;
      insert into public.notifications (user_id, text, href)
        values (w.user_id, 'Abriu uma vaga em "' || ev.title || '". Reserve antes que acabe.', '/casa/' || owner || '?aba=rituais');
    end loop;
  end if;
  return new;
end $function$;

-- ============ F7) duração do ritual ocupa a agenda ============
-- Duração prevista (minutos). Rituais publicados antes desta migration ficam sem duração e, por isso, não bloqueiam horários;
-- ao publicar, mudar a data ou a duração de um ritual, a duração passa a ser obrigatória.
alter table public.events add column if not exists duration_min smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_duration_min_check') then
    alter table public.events add constraint events_duration_min_check check (duration_min is null or duration_min between 15 and 1440);
  end if;
end $$;

create or replace function public.events_schedule_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status is distinct from 'publicado'
       or old.starts_at is distinct from new.starts_at or old.duration_min is distinct from new.duration_min) then
    if new.duration_min is null then raise exception 'Informe a duração do ritual.'; end if;
    -- a casa é a unidade de serialização: atendimentos e rituais não se sobrepõem por corrida
    perform 1 from public.houses where id = new.house_id for update;
    if exists (
      select 1 from public.service_orders o
       where o.house_id = new.house_id and o.scheduled_at is not null
         and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
         and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_min))
    ) then
      raise exception 'Já existe um atendimento marcado neste horário. Escolha outro horário para o ritual.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.events_schedule_guard() from public, anon, authenticated;
drop trigger if exists trg_events_schedule on public.events;
create trigger trg_events_schedule before insert or update on public.events for each row execute function public.events_schedule_guard();

CREATE OR REPLACE FUNCTION public.available_slots(p_service uuid, p_from date DEFAULT NULL::date, p_days integer DEFAULT 14)
 RETURNS TABLE(slot timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  svc public.services%rowtype;
  first_day date;
  n_days integer := least(greatest(coalesce(p_days, 14), 1), 31);
begin
  select * into svc from public.services where id = p_service;
  if not found or not svc.active or not svc.bookable then return; end if;
  first_day := coalesce(p_from, (now() at time zone 'America/Sao_Paulo')::date);
  return query
  select t.s from (
    select ((d::date)::timestamp + a.start_time + make_interval(mins => n * svc.duration_min)) at time zone 'America/Sao_Paulo' as s,
           ((d::date)::timestamp + a.start_time + make_interval(mins => (n + 1) * svc.duration_min)) at time zone 'America/Sao_Paulo' as e
      from generate_series(first_day::timestamp, (first_day + (n_days - 1))::timestamp, interval '1 day') d
      join public.house_availability a on a.house_id = svc.house_id and a.weekday = extract(dow from d)::int
      cross join lateral generate_series(0, 287) n
     where (n + 1) * svc.duration_min <= extract(epoch from (a.end_time - a.start_time))::int / 60
  ) t
  where t.s >= now() + interval '2 hours'
    and not exists (
      select 1 from public.service_orders o
       where o.house_id = svc.house_id and o.scheduled_at is not null
         and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
         and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(t.s, t.e))
    and not exists (
      select 1 from public.events ev
       where ev.house_id = svc.house_id and ev.status = 'publicado' and ev.duration_min is not null
         and tstzrange(ev.starts_at, ev.starts_at + make_interval(mins => ev.duration_min)) && tstzrange(t.s, t.e))
    and not exists (
      select 1 from public.house_blocks b
       where b.house_id = svc.house_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(t.s, t.e))
  order by t.s;
end $function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_service uuid, p_slot timestamp with time zone, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  svc public.services%rowtype;
  oid uuid;
  owner uuid;
  stamp text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para agendar.'; end if;
  select * into svc from public.services where id = p_service;
  if not found or not svc.active or not svc.bookable then raise exception 'Este serviço não tem agenda.'; end if;

  -- Libera horários de pedidos que não foram pagos a tempo.
  update public.service_orders set status = 'expirado'
   where house_id = svc.house_id and scheduled_at is not null and status = 'aguardando_pagamento' and expires_at <= now();
  update public.payments p set status = 'falhou'
   where p.status = 'pendente' and exists (select 1 from public.service_orders o where o.id = p.order_id and o.status = 'expirado');

  -- serializa com a publicação de rituais da mesma casa (ver events_schedule_guard)
  perform 1 from public.houses where id = svc.house_id for update;
  if not exists (select 1 from public.available_slots(p_service, (p_slot at time zone 'America/Sao_Paulo')::date, 1) s where s.slot = p_slot) then
    raise exception 'Esse horário não está mais disponível. Escolha outro.';
  end if;

  perform set_config('app.booking', '1', true);
  oid := public.create_service_order(p_service, p_note);
  perform set_config('app.booking', '', true);

  update public.service_orders
     set scheduled_at = p_slot,
         ends_at = p_slot + make_interval(mins => svc.duration_min),
         modality = case svc.delivery::text when 'presencial' then 'presencial' when 'transmissao' then 'distancia' else null end
   where id = oid;

  -- Sem pagamento ligado, a casa já foi avisada do pedido: acrescenta o horário ao aviso.
  select h.owner_id into owner from public.houses h where h.id = svc.house_id;
  stamp := to_char(p_slot at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  update public.notifications n set text = regexp_replace(n.text, '\.$', '') || '. Horário: ' || stamp || '.'
   where n.id = (select n2.id from public.notifications n2
                  where n2.user_id = owner and n2.text like 'Novo pedido: ' || svc.title || ' — de %'
                    and n2.created_at > now() - interval '1 minute'
                  order by n2.created_at desc limit 1);
  return oid;
exception when exclusion_violation then
  raise exception 'Esse horário acabou de ser reservado. Escolha outro.';
end $function$;

-- ============ F2) privacidade de perfis e curtidas ============
-- Pessoas (clientes) deixam de ser legíveis por visitantes: só o próprio perfil, quem tem relação com ela e a administração.
create or replace function public.can_view_profile(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p = (select auth.uid())
    or public.is_admin()
    or exists (select 1 from public.conversation_members a join public.conversation_members b on b.conversation_id = a.conversation_id
                where a.user_id = (select auth.uid()) and b.user_id = p)
    or exists (select 1 from public.houses h where h.owner_id = (select auth.uid()) and (
         exists (select 1 from public.service_orders o where o.house_id = h.id and o.client_id = p)
      or exists (select 1 from public.reservations r join public.events e on e.id = r.event_id where e.house_id = h.id and r.user_id = p)
      or exists (select 1 from public.event_waitlist w join public.events e on e.id = w.event_id where e.house_id = h.id and w.user_id = p)
      or exists (select 1 from public.follows f where f.house_id = h.id and f.follower_id = p)
      or exists (select 1 from public.house_members m where m.house_id = h.id and m.user_id = p)
      or exists (select 1 from public.refund_requests rr where rr.house_id = h.id and rr.client_id = p)
      or exists (select 1 from public.post_comments c join public.posts po on po.id = c.post_id where po.house_id = h.id and c.user_id = p)
    ))
  );
$$;
revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to anon, authenticated, service_role;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to public
  using (account_type = 'casa' or id = (select auth.uid()) or public.can_view_profile(id));

drop policy if exists likes_read on public.post_likes;
create policy likes_read on public.post_likes for select to public
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.posts po join public.houses h on h.id = po.house_id
     where po.id = post_likes.post_id and h.owner_id = (select auth.uid())));

-- Contagem pública de curtidas (sem identificar quem curtiu).
create or replace function public.post_like_counts(p_posts uuid[])
returns table (post_id uuid, n integer) language sql stable security definer set search_path = public as $$
  select l.post_id, count(*)::integer from public.post_likes l
   where cardinality(p_posts) <= 200 and l.post_id = any (p_posts) group by l.post_id;
$$;
revoke all on function public.post_like_counts(uuid[]) from public;
grant execute on function public.post_like_counts(uuid[]) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.peer_info(p_other uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, is_house boolean, online boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, coalesce(nullif(p.display_name, ''), 'Usuário'), p.avatar_url,
         (p.account_type::text = 'casa'),
         coalesce(p.last_seen_at > now() - interval '35 seconds', false)
  from public.profiles p
  where p.id = p_other and auth.uid() is not null
    and (p.account_type::text = 'casa' or public.can_view_profile(p.id));
$function$;

-- ============ F11) search_path fixo ============
alter function public.fee_cents(bigint, text) set search_path = public;
alter function public.stage_amount_cents(bigint, integer, integer) set search_path = public;
alter function public.events_guard_seats() set search_path = public;

-- ============ F12) forma eficiente de auth.uid() em RLS (mesma regra; produção ainda usa a forma antiga) ============
create or replace function public.is_house_owner(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses where id = h and owner_id = (select auth.uid()));
$$;
create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = (select auth.uid()));
$$;

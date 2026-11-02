-- Equipe da casa: a casa liga e desliga cada ferramenta, uma a uma.
-- Permissões: chat_read, chat_reply, orders, post, calendar, members (só ver), stats (só ver).
-- Pagamentos, plano, equipe, perfil da casa e exclusão da conta nunca vão para a equipe.

alter table public.house_staff add column if not exists perms text[] not null default '{}';
alter table public.house_staff_invites add column if not exists perms text[] not null default '{}';

update public.house_staff set perms = array_remove(array[
  case when can_reply then 'chat_read' end, case when can_reply then 'chat_reply' end, case when can_orders then 'orders' end], null)
  where perms = '{}';
update public.house_staff_invites set perms = array_remove(array[
  case when can_reply then 'chat_read' end, case when can_reply then 'chat_reply' end, case when can_orders then 'orders' end], null)
  where perms = '{}';

alter table public.house_staff drop constraint if exists house_staff_perms_ok;
alter table public.house_staff add constraint house_staff_perms_ok
  check (perms <@ array['chat_read','chat_reply','orders','post','calendar','members','stats']::text[]);
alter table public.house_staff_invites drop constraint if exists house_staff_invites_perms_ok;
alter table public.house_staff_invites add constraint house_staff_invites_perms_ok
  check (perms <@ array['chat_read','chat_reply','orders','post','calendar','members','stats']::text[]);

drop function if exists public.my_staff_house();
alter table public.house_staff drop column if exists can_reply;
alter table public.house_staff drop column if exists can_orders;
alter table public.house_staff_invites drop column if exists can_reply;
alter table public.house_staff_invites drop column if exists can_orders;

create or replace function public.staff_row()
returns public.house_staff language sql stable security definer set search_path = public as $$
  select s.id, s.house_id, s.user_id, s.name, s.active, s.created_at, s.perms
  from (select st.*, row_number() over (partition by st.house_id order by st.created_at, st.id) as rn from public.house_staff st) s
  where s.user_id = auth.uid() and s.active and s.rn <= public.house_seat_allowance(s.house_id);
$$;
revoke all on function public.staff_row() from public;
grant execute on function public.staff_row() to authenticated;

-- Casa (id) em que a pessoa logada atende com a permissão pedida; vazio se não tiver.
create or replace function public.staff_perm(k text)
returns uuid language sql stable security definer set search_path = public as $$
  select s.house_id from public.staff_row() s
  where (k = any (s.perms) or (k = 'chat_read' and 'chat_reply' = any (s.perms)))
    and (k <> 'members' or (select h.plan from public.houses h where h.id = s.house_id) = 'maximo');
$$;
revoke all on function public.staff_perm(text) from public;
grant execute on function public.staff_perm(text) to authenticated;

create or replace function public.accept_staff_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare i public.house_staff_invites; h public.houses;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar.'; end if;
  select * into i from public.house_staff_invites where token = p_token and used_at is null and expires_at > now();
  if i.token is null then raise exception 'Este convite expirou ou já foi usado.'; end if;
  select * into h from public.houses where id = i.house_id;
  if h.owner_id = auth.uid() then raise exception 'Este é o convite da sua própria casa.'; end if;
  if (select count(*) from public.house_staff where house_id = h.id) >= public.house_seat_allowance(h.id) then raise exception 'A casa não tem acesso disponível agora.'; end if;
  if exists (select 1 from public.houses where owner_id = auth.uid()) then raise exception 'Use uma conta de cliente para atender pela casa.'; end if;
  if exists (select 1 from public.house_staff where user_id = auth.uid()) then raise exception 'Você já atende por uma casa.'; end if;
  insert into public.house_staff (house_id, user_id, name, perms) values (i.house_id, auth.uid(), i.name, i.perms);
  update public.house_staff_invites set used_at = now() where token = p_token;
  return h.name;
end $$;

create or replace function public.my_staff_house()
returns table (house_id uuid, house_name text, owner_id uuid, staff_name text, perms text[])
language sql stable security definer set search_path = public as $$
  select h.id, h.name, h.owner_id, s.name, s.perms
  from public.staff_row() s join public.houses h on h.id = s.house_id;
$$;
revoke all on function public.my_staff_house() from public;
grant execute on function public.my_staff_house() to authenticated;

create or replace function public.staff_can_see_conversation(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.houses h
    join public.conversation_members cm on cm.user_id = h.owner_id
    where h.id = public.staff_perm('chat_read') and cm.conversation_id = c
  );
$$;

create or replace function public.staff_conversations()
returns table (conversation_id uuid, other_id uuid, other_name text, last_text text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with st as (select h.owner_id from public.houses h where h.id = public.staff_perm('chat_read'))
  select cm.conversation_id, o.user_id, coalesce(p.display_name, 'Cliente'),
         (select m.text from public.messages m where m.conversation_id = cm.conversation_id and m.deleted_at is null order by m.created_at desc limit 1),
         (select m.created_at from public.messages m where m.conversation_id = cm.conversation_id and m.deleted_at is null order by m.created_at desc limit 1)
  from st
  join public.conversation_members cm on cm.user_id = st.owner_id
  join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id <> st.owner_id
  left join public.profiles p on p.id = o.user_id
  order by 5 desc nulls last
  limit 100;
$$;

create or replace function public.staff_messages(p_conv uuid)
returns table (id uuid, from_house boolean, text text, created_at timestamptz, staff_name text, from_assistant boolean,
               attachment_path text, attachment_type text, attachment_name text, attachment_size int)
language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
  if not public.staff_can_see_conversation(p_conv) then raise exception 'Conversa indisponível.'; end if;
  select h.owner_id into o from public.houses h where h.id = public.staff_perm('chat_read');
  return query
    select m.id, (m.sender_id = o), m.text, m.created_at, m.staff_name, coalesce(m.from_assistant, false),
           m.attachment_path, m.attachment_type, m.attachment_name, m.attachment_size
    from public.messages m where m.conversation_id = p_conv and m.deleted_at is null
    order by m.created_at limit 200;
end $$;

create or replace function public.staff_send(p_conv uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.house_staff; o uuid;
begin
  select * into s from public.staff_row();
  if s.id is null then raise exception 'Você não atende por nenhuma casa.'; end if;
  if not ('chat_reply' = any (s.perms)) then raise exception 'O seu acesso não inclui responder conversas.'; end if;
  if not public.staff_can_see_conversation(p_conv) then raise exception 'Conversa indisponível.'; end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then raise exception 'Escreva a mensagem.'; end if;
  select owner_id into o from public.houses where id = s.house_id;
  insert into public.messages (conversation_id, sender_id, text, from_assistant, staff_name)
    values (p_conv, o, left(trim(p_text), 2000), false, s.name);
end $$;

create or replace function public.staff_orders()
returns table (id uuid, title text, status text, client_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare hid uuid := public.staff_perm('orders');
begin
  if hid is null then raise exception 'O seu acesso não inclui os pedidos.'; end if;
  return query
    select o.id, o.title, o.status::text, coalesce(p.display_name, 'Cliente'), o.created_at
    from public.service_orders o left join public.profiles p on p.id = o.client_id
    where o.house_id = hid order by o.created_at desc limit 50;
end $$;

-- Publicar na comunidade em nome da casa (só texto; fica registrado quem publicou).
alter table public.posts add column if not exists staff_name text;
create or replace function public.staff_post(p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid := public.staff_perm('post'); nm text; pid uuid;
begin
  if hid is null then raise exception 'O seu acesso não inclui publicar.'; end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then raise exception 'Escreva a publicação.'; end if;
  select name into nm from public.staff_row();
  insert into public.posts (house_id, kind, content, staff_name) values (hid, 'geral', left(trim(p_text), 2000), nm) returning id into pid;
  return pid;
end $$;
revoke all on function public.staff_post(text) from public;
grant execute on function public.staff_post(text) to authenticated;

-- Agenda: a equipe vê, adiciona e remove datas. Repetição anual e público "seguidores" ficam com a casa.
create or replace function public.staff_calendar_list()
returns table (id uuid, title text, kind text, on_date date, on_time time, note text, vis_public boolean)
language plpgsql stable security definer set search_path = public as $$
declare hid uuid := public.staff_perm('calendar');
begin
  if hid is null then raise exception 'O seu acesso não inclui a agenda.'; end if;
  return query select c.id, c.title, c.kind, c.on_date, c.on_time, c.note, c.vis_public
    from public.house_calendar_items c where c.house_id = hid and c.on_date >= current_date - 1 order by c.on_date, c.on_time nulls last limit 100;
end $$;
revoke all on function public.staff_calendar_list() from public;
grant execute on function public.staff_calendar_list() to authenticated;

create or replace function public.staff_calendar_add(p_title text, p_kind text, p_date date, p_time time, p_note text, p_public boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid := public.staff_perm('calendar'); nid uuid;
begin
  if hid is null then raise exception 'O seu acesso não inclui a agenda.'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 or char_length(p_title) > 80 then raise exception 'Dê um nome à data.'; end if;
  if p_date is null then raise exception 'Escolha a data.'; end if;
  if p_kind not in ('gira','obrigacao','celebracao','outro') then raise exception 'Tipo inválido.'; end if;
  insert into public.house_calendar_items (house_id, title, kind, on_date, on_time, note, yearly, vis_public, vis_followers, vis_house, vis_assistant)
    values (hid, trim(p_title), p_kind, p_date, p_time, nullif(left(trim(coalesce(p_note, '')), 300), ''), false, coalesce(p_public, false), false, true, coalesce(p_public, false))
    returning id into nid;
  return nid;
end $$;
revoke all on function public.staff_calendar_add(text, text, date, time, text, boolean) from public;
grant execute on function public.staff_calendar_add(text, text, date, time, text, boolean) to authenticated;

create or replace function public.staff_calendar_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid := public.staff_perm('calendar');
begin
  if hid is null then raise exception 'O seu acesso não inclui a agenda.'; end if;
  delete from public.house_calendar_items where id = p_id and house_id = hid;
end $$;
revoke all on function public.staff_calendar_delete(uuid) from public;
grant execute on function public.staff_calendar_delete(uuid) to authenticated;

-- Membros (só ver): a equipe lê a lista e as mensalidades, sem as anotações privadas e sem alterar nada.
create or replace function public.house_members_overview(p_today date DEFAULT NULL::date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sh uuid := public.staff_perm('members'); h uuid := coalesce(sh, public.member_my_house());
  today date := coalesce(p_today, public.member_today()); res jsonb;
begin
  with base as (
    select m.*,
      (select count(*) from public.member_dues d where d.member_id = m.id and d.status = 'aberta' and d.due_date < today) as late_count,
      (select coalesce(sum(d.amount_cents), 0) from public.member_dues d where d.member_id = m.id and d.status = 'aberta' and d.due_date < today) as late_cents,
      (select count(*) from public.member_dues d where d.member_id = m.id and d.status = 'aberta' and d.due_date >= today and d.due_date <= today + 3) as soon_count
    from public.house_members m where m.house_id = h and m.left_at is null
  ), typed as (
    select b.*, case when b.monthly_cents = 0 then 'sem_mensalidade'
                     when b.late_count > 0 then 'vencida'
                     when b.soon_count > 0 then 'perto'
                     else 'em_dia' end as situacao
    from base b
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', (select count(*) from typed),
      'vencidas', (select count(*) from typed where situacao = 'vencida'),
      'perto', (select count(*) from typed where situacao = 'perto'),
      'em_dia', (select count(*) from typed where situacao = 'em_dia'),
      'atrasado_cents', (select coalesce(sum(late_cents), 0) from typed)),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.display_name, 'bond', t.bond, 'note', case when sh is null then t.note else null end,
        'monthly_cents', t.monthly_cents, 'due_day', t.due_day, 'start_month', t.start_month,
        'has_account', t.user_id is not null, 'consent_at', t.consent_at,
        'situacao', t.situacao, 'late_count', t.late_count, 'late_cents', t.late_cents,
        'dues', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'month', d.month, 'amount_cents', d.amount_cents,
                   'due_date', d.due_date, 'status', d.status, 'paid_via', d.paid_via) order by d.month desc)
                  from (select * from public.member_dues x where x.member_id = t.id order by x.month desc limit 6) d), '[]'::jsonb)
      ) order by case t.situacao when 'vencida' then 0 when 'perto' then 1 when 'em_dia' then 2 else 3 end, lower(t.display_name))
      from typed t), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Divulgação (só ver): a equipe lê os números dos links e os assuntos mais procurados.
create or replace function public.my_campaigns_summary()
returns table (id uuid, code text, label text, source text, active boolean, visits bigint, contacts bigint, visits_30d bigint)
language sql stable security definer set search_path = public as $$
  select hc.id, hc.code, hc.label, hc.source, hc.active,
         coalesce(sum(d.visits),0), coalesce(sum(d.contacts),0),
         coalesce(sum(d.visits) filter (where d.day >= (now() at time zone 'America/Sao_Paulo')::date - 29),0)
  from public.house_campaigns hc
  join public.houses h on h.id = hc.house_id
    and h.id = coalesce(public.staff_perm('stats'), (select x.id from public.houses x where x.owner_id = auth.uid()))
  left join public.house_campaign_days d on d.campaign_id = hc.id
  group by hc.id order by hc.created_at;
$$;

create or replace function public.my_house_topics(p_days int default 30)
returns table (topic text, total bigint)
language sql stable security definer set search_path = public as $$
  with me as (select h.owner_id from public.houses h
              where h.id = coalesce(public.staff_perm('stats'), (select x.id from public.houses x where x.owner_id = auth.uid()))),
  msgs as (
    select lower(m.text) as t
    from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = (select owner_id from me)
    where m.sender_id <> (select owner_id from me)
      and not coalesce(m.from_assistant, false)
      and m.deleted_at is null
      and m.created_at >= now() - make_interval(days => greatest(least(p_days, 365), 1))
  ),
  topics(topic, rx) as (values
    ('Endereço e como chegar', 'endere[cç]o|onde fica|localiza|como chegar|bairro'),
    ('Horários', 'hor[aá]rio|que horas|a que horas|funciona|abre '),
    ('Valores', 'valor|pre[cç]o|quanto custa|quanto [eé]|quanto fica|cobra'),
    ('Agendar e vagas', 'agendar|marcar|reservar|vaga|disponib'),
    ('Rituais e encontros', 'ritual|gira|encontro|festa|cerim[oô]nia|festividade'),
    ('Trabalhos e atendimentos', 'trabalho|atendimento|consulta|jogo|servi[cç]o'),
    ('O que levar e vestir', 'levar|roupa|vestir|vestimenta|traje'),
    ('Pagamento e reembolso', 'pagamento|pagar|pix|cart[aã]o|reembolso|cancel')
  )
  select tp.topic, count(*)::bigint as total
  from topics tp join msgs on msgs.t ~ tp.rx
  group by tp.topic
  order by 2 desc, 1;
$$;

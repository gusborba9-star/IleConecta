-- Agenda da casa: jogo de búzios, cartas e consulta podem ser agendados e pagos pela plataforma.
-- Reaproveita service_orders (pagamento, reembolso e notificações já existentes) e acrescenta o horário.
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

alter table public.services
  add column if not exists bookable boolean not null default false,
  add column if not exists duration_min smallint not null default 30;
alter table public.services drop constraint if exists services_duration_chk;
alter table public.services add constraint services_duration_chk check (duration_min between 10 and 240);
alter table public.services drop constraint if exists services_bookable_kind_chk;
alter table public.services add constraint services_bookable_kind_chk
  check (not bookable or kind::text in ('buzios', 'cartas', 'consulta'));

alter table public.service_orders
  add column if not exists scheduled_at timestamptz,
  add column if not exists ends_at timestamptz;
alter table public.service_orders drop constraint if exists service_orders_slot_chk;
alter table public.service_orders add constraint service_orders_slot_chk
  check ((scheduled_at is null) = (ends_at is null) and (scheduled_at is null or ends_at > scheduled_at));
-- Dois pedidos ativos da mesma casa não podem ocupar o mesmo horário (impede reserva dupla mesmo em corrida).
alter table public.service_orders drop constraint if exists service_orders_no_overlap;
alter table public.service_orders add constraint service_orders_no_overlap
  exclude using gist (house_id with =, tstzrange(scheduled_at, ends_at) with &&)
  where (scheduled_at is not null and status in ('aguardando_pagamento', 'confirmado', 'em_andamento'));

-- Janelas semanais de atendimento (0 = domingo ... 6 = sábado), no horário de Brasília.
create table if not exists public.house_availability (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index if not exists house_availability_house_idx on public.house_availability (house_id, weekday);
alter table public.house_availability enable row level security;
drop policy if exists availability_owner on public.house_availability;
create policy availability_owner on public.house_availability for all to authenticated
  using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));
revoke all on public.house_availability from anon;

-- Bloqueios manuais (folga, viagem, horário já combinado fora da plataforma).
create table if not exists public.house_blocks (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists house_blocks_house_idx on public.house_blocks (house_id, starts_at);
alter table public.house_blocks enable row level security;
drop policy if exists blocks_owner on public.house_blocks;
create policy blocks_owner on public.house_blocks for all to authenticated
  using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));
revoke all on public.house_blocks from anon;

-- Horários livres de um serviço agendável (a partir de 2 h de antecedência).
create or replace function public.available_slots(p_service uuid, p_from date default null, p_days integer default 14)
returns table(slot timestamptz) language plpgsql stable security definer set search_path = public as $$
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
      select 1 from public.house_blocks b
       where b.house_id = svc.house_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(t.s, t.e))
  order by t.s;
end $$;
revoke all on function public.available_slots(uuid, date, integer) from public, anon;
grant execute on function public.available_slots(uuid, date, integer) to authenticated, service_role;

-- Reserva um horário: cria o pedido (com cobrança, se os pagamentos estiverem ligados) e fixa o horário.
create or replace function public.create_booking(p_service uuid, p_slot timestamptz, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.create_booking(uuid, timestamptz, text) from public, anon;
grant execute on function public.create_booking(uuid, timestamptz, text) to authenticated;

-- Ajustes nas funções existentes (trocas exatas; falha se o texto não for encontrado).
do $$
declare
  src text;
  patched text;
begin
  -- create_service_order: serviço presencial agendável pode ser contratado; agendável exige horário.
  src := pg_get_functiondef('public.create_service_order(uuid, text)'::regprocedure);
  patched := replace(src, 'if svc.delivery = ''presencial'' then raise exception', 'if svc.delivery = ''presencial'' and not svc.bookable then raise exception');
  if patched = src then raise exception 'create_service_order: trecho presencial nao encontrado'; end if;
  src := patched;
  patched := replace(src, 'if char_length(coalesce(p_note, '''')) > 800',
    'if svc.bookable and coalesce(current_setting(''app.booking'', true), '''') <> ''1'' then raise exception ''Escolha um dia e horário para contratar este serviço.''; end if; if char_length(coalesce(p_note, '''')) > 800');
  if patched = src then raise exception 'create_service_order: trecho de nota nao encontrado'; end if;
  execute patched;

  -- confirm_payment: horário no aviso à casa e proteção contra horário ocupado após expirar.
  src := pg_get_functiondef('public.confirm_payment(text)'::regprocedure);
  patched := replace(src, '|| '' — de '' || cname || ''.'',',
    '|| '' — de '' || cname || ''.'' || coalesce('' Horário: '' || to_char(ord.scheduled_at at time zone ''America/Sao_Paulo'', ''DD/MM "às" HH24:MI'') || ''.'', ''''),');
  if patched = src then raise exception 'confirm_payment: trecho de aviso nao encontrado'; end if;
  src := patched;
  patched := replace(src, 'if ord.status <> ''aguardando_pagamento''',
    'if (ord.status = ''expirado'' and ord.scheduled_at is not null and exists (select 1 from public.service_orders o3 where o3.house_id = ord.house_id and o3.id <> ord.id and o3.scheduled_at is not null and o3.status in (''aguardando_pagamento'', ''confirmado'', ''em_andamento'') and tstzrange(o3.scheduled_at, o3.ends_at) && tstzrange(ord.scheduled_at, ord.ends_at))) or ord.status <> ''aguardando_pagamento''');
  if patched = src then raise exception 'confirm_payment: trecho de status nao encontrado'; end if;
  execute patched;
end $$;

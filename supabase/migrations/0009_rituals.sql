-- Rituais (eventos coletivos): forma de realização, campos configuráveis, reservas de vagas
-- e link de transmissão protegido. Sem cobrança real nesta etapa (a reserva já confirma a vaga;
-- quando o Pix chegar, passa a nascer como "aguardando_pagamento").
-- Rode no SQL Editor do Supabase. É seguro repetir.

alter type public.event_mode add value if not exists 'sigilo';

alter table public.events
  add column if not exists intake_fields jsonb not null default '[]'::jsonb,
  add column if not exists started_at timestamptz;

alter table public.reservations
  add column if not exists answers jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.events add constraint events_title_len check (char_length(title) between 2 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_price_max check (price_cents <= 10000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_seats_max check (seats_total <= 5000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_desc_len check (description is null or char_length(description) <= 1500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_fields_shape check (jsonb_typeof(intake_fields) = 'array' and jsonb_array_length(intake_fields) <= 8);
exception when duplicate_object then null; end $$;

-- Uma pessoa não ocupa duas vagas no mesmo ritual.
create unique index if not exists reservations_one_active_per_user
  on public.reservations (event_id, user_id)
  where status in ('aguardando_pagamento', 'confirmada');

-- Link de transmissão: só a casa e quem tem reserva confirmada enxergam.
create table if not exists public.event_secrets (
  event_id uuid primary key references public.events(id) on delete cascade,
  stream_url text check (stream_url is null or (char_length(stream_url) <= 500 and stream_url ~* '^https://'))
);
alter table public.event_secrets enable row level security;
drop policy if exists event_secrets_owner on public.event_secrets;
create policy event_secrets_owner on public.event_secrets for all
  using (exists (select 1 from public.events e where e.id = event_id and public.is_house_owner(e.house_id)))
  with check (exists (select 1 from public.events e where e.id = event_id and public.is_house_owner(e.house_id)));

-- Vagas ocupadas (público, só o número).
create or replace function public.event_taken(p_event uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.reservations r
  where r.event_id = p_event
    and (r.status = 'confirmada' or (r.status = 'aguardando_pagamento' and r.expires_at > now()));
$$;
grant execute on function public.event_taken(uuid) to anon, authenticated;

-- Não permite reduzir as vagas abaixo do que já foi reservado.
create or replace function public.events_guard_seats()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.seats_total < public.event_taken(new.id) then
    raise exception 'Já existem % vagas reservadas; não é possível reduzir abaixo disso.', public.event_taken(new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_events_guard_seats on public.events;
create trigger trg_events_guard_seats before update on public.events
  for each row execute function public.events_guard_seats();

-- Reservar vaga (atômico, sem estourar o limite).
create or replace function public.reserve_event(p_event uuid, p_answers jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  f jsonb;
  v text;
  rid uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para reservar.'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found or ev.status <> 'publicado' then raise exception 'Este ritual não está disponível.'; end if;
  if ev.started_at is not null or ev.starts_at <= now() then raise exception 'As reservas deste ritual foram encerradas.'; end if;
  if public.is_house_owner(ev.house_id) then raise exception 'A casa não reserva vaga no próprio ritual.'; end if;
  if public.event_taken(p_event) >= ev.seats_total then raise exception 'Vagas esgotadas.'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Respostas inválidas.'; end if;
  for f in select * from jsonb_array_elements(ev.intake_fields) loop
    v := btrim(coalesce(p_answers ->> (f ->> 'id'), ''));
    if coalesce((f ->> 'required')::boolean, false) and v = '' then
      raise exception 'Preencha: %', f ->> 'label';
    end if;
    if char_length(v) > 500 then raise exception 'Resposta muito longa: %', f ->> 'label'; end if;
  end loop;
  insert into public.reservations (event_id, user_id, status, answers)
  values (p_event, auth.uid(), 'confirmada',
          (select coalesce(jsonb_object_agg(f ->> 'id', btrim(coalesce(p_answers ->> (f ->> 'id'), ''))), '{}'::jsonb)
             from jsonb_array_elements(ev.intake_fields) f))
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'Você já tem vaga neste ritual.';
end $$;
grant execute on function public.reserve_event(uuid, jsonb) to authenticated;

-- Cliente cancela a própria vaga antes do início.
create or replace function public.cancel_reservation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reservations r set status = 'cancelada'
  where r.id = p_id and r.user_id = auth.uid() and r.status in ('confirmada', 'aguardando_pagamento')
    and exists (select 1 from public.events e where e.id = r.event_id and e.started_at is null and e.starts_at > now());
  if not found then raise exception 'Não foi possível cancelar esta reserva.'; end if;
end $$;
grant execute on function public.cancel_reservation(uuid) to authenticated;

-- Lista de participantes (só a casa).
create or replace function public.event_attendees(p_event uuid)
returns table (reservation_id uuid, user_id uuid, name text, status public.reservation_status, answers jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, coalesce(p.display_name, 'Participante'), r.status, r.answers, r.created_at
  from public.reservations r
  join public.events e on e.id = r.event_id
  left join public.profiles p on p.id = r.user_id
  where r.event_id = p_event and public.is_house_owner(e.house_id)
  order by r.created_at;
$$;
grant execute on function public.event_attendees(uuid) to authenticated;

-- Link da transmissão: a casa ou quem tem reserva confirmada.
create or replace function public.event_stream_url(p_event uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.stream_url from public.event_secrets s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event
    and (public.is_house_owner(e.house_id)
         or exists (select 1 from public.reservations r where r.event_id = p_event and r.user_id = auth.uid() and r.status = 'confirmada'));
$$;
grant execute on function public.event_stream_url(uuid) to authenticated;

-- Atualização das vagas em tempo real para a casa.
do $$ begin
  alter publication supabase_realtime add table public.reservations;
exception when duplicate_object then null; when undefined_object then null; end $$;

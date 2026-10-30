-- Registros do ritual: a casa publica fotos (início, durante, fim) para quem tem vaga confirmada.
-- Privado: só a casa, os participantes confirmados e, em caso de reembolso em aberto, a administração.
-- Cada registro fica disponível por 30 dias. Rode no SQL Editor. É seguro repetir.

create table if not exists public.event_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('inicio', 'durante', 'fim')),
  caption text check (caption is null or char_length(caption) <= 300),
  path text not null unique,
  size_bytes integer,
  secret boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists event_records_event on public.event_records (event_id, created_at desc);

-- Funções de apoio (security definer: evitam o erro de permissão ao consultar outras tabelas dentro das regras).
create or replace function public.is_event_owner(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where e.id = p_event and public.is_house_owner(e.house_id));
$$;

create or replace function public.event_records_access(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event
       and (
         public.is_house_owner(e.house_id)
         or exists (select 1 from public.reservations r
                     where r.event_id = e.id and r.user_id = (select auth.uid()) and r.status = 'confirmada')
         or (public.is_admin() and exists (
               select 1 from public.refund_requests rr
                 join public.reservations r on r.id = rr.reservation_id
                where r.event_id = e.id and rr.status in ('pendente', 'aprovado')))
       )
  );
$$;

create or replace function public.record_file_visible(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_records er
                  where er.path = p_path and er.expires_at > now() and public.event_records_access(er.event_id));
$$;

alter table public.event_records enable row level security;
drop policy if exists event_records_read on public.event_records;
create policy event_records_read on public.event_records for select to authenticated
  using (expires_at > now() and public.event_records_access(event_id));
-- Sem políticas de escrita: tudo passa pelas funções abaixo.

-- Armazenamento privado (fotos reduzidas no aparelho; limite de 5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ritual-records', 'ritual-records', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "records: casa envia" on storage.objects;
drop policy if exists "records: ver" on storage.objects;
drop policy if exists "records: casa apaga" on storage.objects;
create policy "records: casa envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'ritual-records' and public.is_event_owner(((storage.foldername(name))[1])::uuid));
create policy "records: ver" on storage.objects for select to authenticated
  using (bucket_id = 'ritual-records' and public.record_file_visible(name));
create policy "records: casa apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'ritual-records' and public.is_event_owner(((storage.foldername(name))[1])::uuid));

-- A casa publica um registro e os participantes confirmados são avisados. Devolve quantos foram avisados.
create or replace function public.add_event_record(p_event uuid, p_kind text, p_caption text, p_path text, p_size integer, p_secret boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  hname text;
  owner uuid;
  n integer;
begin
  select * into ev from public.events where id = p_event;
  if not found or not public.is_house_owner(ev.house_id) then raise exception 'Ritual não encontrado.'; end if;
  if ev.started_at is null then raise exception 'Inicie o ritual para publicar registros.'; end if;
  if ev.status not in ('publicado', 'encerrado') then raise exception 'Este ritual não está ativo.'; end if;
  if ev.finished_at is not null and ev.finished_at < now() - interval '7 days' then
    raise exception 'O prazo para publicar registros deste ritual terminou.';
  end if;
  if p_kind not in ('inicio', 'durante', 'fim') then raise exception 'Tipo de registro inválido.'; end if;
  if p_path is null or p_path not like p_event::text || '/%' then raise exception 'Arquivo inválido.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'ritual-records' and name = p_path) then
    raise exception 'O arquivo não foi enviado.';
  end if;
  if (select count(*) from public.event_records where event_id = p_event and expires_at > now()) >= 12 then
    raise exception 'Limite de 12 registros por ritual. Apague algum para publicar outro.';
  end if;

  insert into public.event_records (event_id, kind, caption, path, size_bytes, secret)
  values (p_event, p_kind, nullif(trim(p_caption), ''), p_path, p_size, coalesce(p_secret, false));

  select h.name, h.owner_id into hname, owner from public.houses h where h.id = ev.house_id;
  insert into public.notifications (user_id, text, href)
  select r.user_id,
         'Novo registro do ritual ' || ev.title || ': ' || hname || ' publicou uma foto.',
         '/casa/' || owner || '?aba=rituais'
    from public.reservations r
   where r.event_id = p_event and r.status = 'confirmada';
  get diagnostics n = row_count;
  return n;
end $$;

-- A casa apaga um registro; devolve o caminho do arquivo para o aplicativo remover do armazenamento.
create or replace function public.delete_event_record(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  rec public.event_records%rowtype;
begin
  select * into rec from public.event_records where id = p_id;
  if not found or not public.is_event_owner(rec.event_id) then raise exception 'Registro não encontrado.'; end if;
  delete from public.event_records where id = p_id;
  return rec.path;
end $$;

revoke all on function public.add_event_record(uuid, text, text, text, integer, boolean) from public, anon;
revoke all on function public.delete_event_record(uuid) from public, anon;
grant execute on function public.add_event_record(uuid, text, text, text, integer, boolean) to authenticated;
grant execute on function public.delete_event_record(uuid) to authenticated;
revoke all on function public.is_event_owner(uuid) from public, anon;
revoke all on function public.event_records_access(uuid) from public, anon;
revoke all on function public.record_file_visible(text) from public, anon;
grant execute on function public.is_event_owner(uuid) to authenticated;
grant execute on function public.event_records_access(uuid) to authenticated;
grant execute on function public.record_file_visible(text) to authenticated;

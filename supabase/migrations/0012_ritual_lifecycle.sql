-- Início e fim do ritual pela casa, com aviso a todos os participantes (rituais coletivos: um comando atinge todas as vagas).
-- O fim real do ritual passa a definir quando o repasse fica elegível (72h depois). Rode no SQL Editor. É seguro repetir.

alter table public.events add column if not exists finished_at timestamptz;

-- Avisos chegam na hora para quem está com o app aberto.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- A casa inicia o ritual: fecha as reservas e avisa todos os participantes confirmados. Devolve quantos foram avisados.
create or replace function public.start_event(p_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  hname text;
  owner uuid;
  n integer;
begin
  select * into ev from public.events where id = p_event for update;
  if not found or not public.is_house_owner(ev.house_id) then raise exception 'Ritual não encontrado.'; end if;
  if ev.status <> 'publicado' then raise exception 'Só é possível iniciar um ritual publicado.'; end if;
  if ev.started_at is not null then raise exception 'Este ritual já foi iniciado.'; end if;

  update public.events set started_at = now() where id = p_event;
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = ev.house_id;

  insert into public.notifications (user_id, text, href)
  select r.user_id,
         'Começou: ' || ev.title || '. ' || hname || ' iniciou o ritual agora.'
           || case when ev.mode in ('distancia', 'hibrido') then ' Abra a página do ritual para entrar na transmissão.' else '' end,
         '/casa/' || owner || '?aba=rituais'
    from public.reservations r
   where r.event_id = p_event and r.status = 'confirmada';
  get diagnostics n = row_count;
  return n;
end $$;

-- A casa conclui o ritual: encerra, avisa os participantes e começa a contar as 72h do repasse a partir de agora.
create or replace function public.finish_event(p_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  hname text;
  owner uuid;
  n integer;
begin
  select * into ev from public.events where id = p_event for update;
  if not found or not public.is_house_owner(ev.house_id) then raise exception 'Ritual não encontrado.'; end if;
  if ev.started_at is null then raise exception 'Inicie o ritual antes de concluir.'; end if;
  if ev.finished_at is not null or ev.status <> 'publicado' then raise exception 'Este ritual já foi concluído.'; end if;

  update public.events set finished_at = now(), status = 'encerrado' where id = p_event;
  update public.payouts set eligible_at = now() + interval '72 hours'
   where event_id = p_event and status = 'bloqueado';
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = ev.house_id;

  insert into public.notifications (user_id, text, href)
  select r.user_id,
         'Concluído: ' || ev.title || '. ' || hname || ' finalizou o ritual.',
         '/casa/' || owner || '?aba=rituais'
    from public.reservations r
   where r.event_id = p_event and r.status = 'confirmada';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.start_event(uuid) from public, anon;
revoke all on function public.finish_event(uuid) from public, anon;
grant execute on function public.start_event(uuid) to authenticated;
grant execute on function public.finish_event(uuid) to authenticated;

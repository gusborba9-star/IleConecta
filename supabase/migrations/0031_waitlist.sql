-- Fila de espera dos rituais: quando lota, o cliente entra na fila; a casa é avisada e, se abrir vaga, o próximo da fila também.
create table if not exists public.event_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (event_id, user_id)
);
create index if not exists event_waitlist_event_idx on public.event_waitlist (event_id, created_at);
alter table public.event_waitlist enable row level security;
drop policy if exists waitlist_self on public.event_waitlist;
create policy waitlist_self on public.event_waitlist for select to authenticated using (user_id = auth.uid());
drop policy if exists waitlist_house on public.event_waitlist;
create policy waitlist_house on public.event_waitlist for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.is_house_owner(e.house_id)));
revoke all on public.event_waitlist from anon;
revoke insert, update, delete on public.event_waitlist from authenticated;

create or replace function public.join_event_waitlist(p_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  owner uuid;
  cname text;
  added integer;
  pos integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para entrar na fila.'; end if;
  select * into ev from public.events where id = p_event;
  if not found or ev.status <> 'publicado' or ev.starts_at <= now() or ev.started_at is not null then
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
end $$;
revoke all on function public.join_event_waitlist(uuid) from public, anon;
grant execute on function public.join_event_waitlist(uuid) to authenticated;

create or replace function public.leave_event_waitlist(p_event uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.event_waitlist where event_id = p_event and user_id = auth.uid();
$$;
revoke all on function public.leave_event_waitlist(uuid) from public, anon;
grant execute on function public.leave_event_waitlist(uuid) to authenticated;

-- Abriu vaga (cancelamento ou reembolso): avisa os próximos da fila, um por vaga livre.
create or replace function public.notify_waitlist_on_free_seat()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  owner uuid;
  free integer;
  w record;
begin
  if old.status in ('confirmada', 'aguardando_pagamento') and new.status in ('cancelada', 'expirada', 'reembolso_pendente') then
    select * into ev from public.events where id = new.event_id;
    if not found or ev.status <> 'publicado' or ev.starts_at <= now() or ev.started_at is not null then return new; end if;
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
end $$;
drop trigger if exists trg_waitlist_free_seat on public.reservations;
create trigger trg_waitlist_free_seat after update of status on public.reservations
  for each row execute function public.notify_waitlist_on_free_seat();

-- Quem reservou sai da fila.
create or replace function public.leave_waitlist_on_reserve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.event_waitlist where event_id = new.event_id and user_id = new.user_id;
  return new;
end $$;
drop trigger if exists trg_waitlist_reserved on public.reservations;
create trigger trg_waitlist_reserved after insert on public.reservations
  for each row execute function public.leave_waitlist_on_reserve();

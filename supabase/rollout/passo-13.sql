-- PASSO 13 de 18: 0067 c: fila de espera
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

-- FIM DO PASSO 13

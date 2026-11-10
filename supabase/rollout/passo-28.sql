-- PASSO 28 de 30: 0071 — F4: assumir, devolver e ver o estado
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

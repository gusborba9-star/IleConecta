-- 0072 — F4: a assistente volta a atender quando a casa está offline e parada.
-- Antes: depois que a casa respondia, a assistente ficava calada por 12 horas, mesmo com a casa offline.
-- Agora, o estado "humano" só segura a assistente enquanto a casa está online (visto nos últimos 3 min) ou respondeu há menos de 10 min
-- (cobre a equipe, que não marca presença no perfil do dono). O estado "pendente" (assistente passou para a casa) continua valendo por 12 h.

create or replace function public.handoff_effective_active(p_state text, p_updated timestamptz, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_state = 'pendente' and p_updated > now() - interval '12 hours'
    or (p_state = 'humano' and p_updated > now() - interval '12 hours'
        and (p_updated > now() - interval '10 minutes'
             or coalesce((select pr.last_seen_at > now() - interval '3 minutes' from public.profiles pr where pr.id = p_owner), false))),
    false);
$$;
revoke all on function public.handoff_effective_active(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.handoff_effective_active(text, timestamptz, uuid) to service_role;

create or replace function public.handoff_allows_assistant(p_conv uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.conversation_handoff h
    where h.conversation_id = p_conv and h.house_owner_id = p_owner
      and public.handoff_effective_active(h.state, h.updated_at, h.house_owner_id)
  );
$$;
revoke all on function public.handoff_allows_assistant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.handoff_allows_assistant(uuid, uuid) to service_role;

create or replace function public.conversation_handoff_state(p_conv uuid)
returns table (state text, handler_name text, since timestamptz, active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if not (public.is_conversation_member(p_conv) or (public.staff_perm('chat_read') is not null and public.staff_can_see_conversation(p_conv))) then
    raise exception 'Conversa indisponível.' using errcode = '42501';
  end if;
  return query
    select h.state, h.handler_name, h.since, public.handoff_effective_active(h.state, h.updated_at, h.house_owner_id)
    from public.conversation_handoff h where h.conversation_id = p_conv;
  if not found then return query select 'automacao'::text, null::text, null::timestamptz, false; end if;
end $$;
revoke all on function public.conversation_handoff_state(uuid) from public, anon;
grant execute on function public.conversation_handoff_state(uuid) to authenticated;

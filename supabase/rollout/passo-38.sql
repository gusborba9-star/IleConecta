-- PASSO 38: 0075 — a assistente só se cala quando a casa está atendendo (pendente não cala mais)
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

create or replace function public.handoff_effective_active(p_state text, p_updated timestamptz, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_state = 'pendente' and p_updated > now() - interval '2 hours'
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
    where h.conversation_id = p_conv and h.house_owner_id = p_owner and h.state = 'humano'
      and public.handoff_effective_active(h.state, h.updated_at, h.house_owner_id)
  );
$$;
revoke all on function public.handoff_allows_assistant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.handoff_allows_assistant(uuid, uuid) to service_role;

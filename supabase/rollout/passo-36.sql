-- PASSO 36: 0074 — a conversa passada para a casa vale 15 minutos
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.


alter table public.handoff_events drop constraint if exists handoff_events_action_check;
alter table public.handoff_events add constraint handoff_events_action_check
  check (action in ('passada_para_casa', 'assumida', 'devolvida', 'lembrete'));

create or replace function public.handoff_effective_active(p_state text, p_updated timestamptz, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_state = 'pendente' and p_updated > now() - interval '15 minutes'
    or (p_state = 'humano' and p_updated > now() - interval '12 hours'
        and (p_updated > now() - interval '10 minutes'
             or coalesce((select pr.last_seen_at > now() - interval '3 minutes' from public.profiles pr where pr.id = p_owner), false))),
    false);
$$;
revoke all on function public.handoff_effective_active(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.handoff_effective_active(text, timestamptz, uuid) to service_role;

create or replace function public.handoff_mark_pending(p_conv uuid, p_owner uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_notify boolean;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = p_owner) then
    raise exception 'Conversa da casa não encontrada.';
  end if;
  insert into public.conversation_handoff (conversation_id, house_owner_id, state, reason, handler_name, since, updated_at)
  values (p_conv, p_owner, 'pendente', nullif(left(btrim(coalesce(p_reason, '')), 200), ''), null, now(), now())
  on conflict (conversation_id) do update
    set house_owner_id = excluded.house_owner_id, state = 'pendente', reason = excluded.reason, handler_name = null,
        since = case when public.conversation_handoff.state = 'pendente' and public.conversation_handoff.house_owner_id = excluded.house_owner_id
                     then public.conversation_handoff.since else now() end,
        updated_at = now();
  -- a linha acima trava a conversa até o fim da transação: duas passagens simultâneas não avisam duas vezes
  v_notify := not exists (
    select 1 from public.handoff_events e
    where e.conversation_id = p_conv and e.action = 'passada_para_casa' and e.created_at > now() - interval '10 minutes');
  insert into public.handoff_events (conversation_id, house_owner_id, action) values (p_conv, p_owner, 'passada_para_casa');
  return v_notify;
end $$;
revoke all on function public.handoff_mark_pending(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.handoff_mark_pending(uuid, uuid, text) to service_role;

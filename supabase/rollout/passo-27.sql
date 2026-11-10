-- PASSO 27 de 30: 0071 — F4: a assistente consulta e registra o estado; resposta humana assume a conversa
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 4) A assistente pode responder nesta conversa? (só o servico da assistente chama)
create or replace function public.handoff_allows_assistant(p_conv uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.conversation_handoff h
    where h.conversation_id = p_conv and h.house_owner_id = p_owner
      and h.state in ('pendente', 'humano') and h.updated_at > now() - interval '12 hours'
  );
$$;
revoke all on function public.handoff_allows_assistant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.handoff_allows_assistant(uuid, uuid) to service_role;

-- 5) A assistente passou a conversa para a casa. Devolve true quando o aviso deve ser enviado (no máximo 1 a cada 30 minutos por conversa).
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
    where e.conversation_id = p_conv and e.action = 'passada_para_casa' and e.created_at > now() - interval '30 minutes');
  insert into public.handoff_events (conversation_id, house_owner_id, action) values (p_conv, p_owner, 'passada_para_casa');
  return v_notify;
end $$;
revoke all on function public.handoff_mark_pending(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.handoff_mark_pending(uuid, uuid, text) to service_role;

-- 6) A casa ou a equipe respondeu: a conversa passa a ser humana.
create or replace function public.trg_messages_handoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text; v_prev_owner uuid;
begin
  if new.from_assistant then return null; end if;
  -- só conta quem é dono de casa (a equipe grava com o id do dono); mensagem de cliente não muda o estado
  if not exists (select 1 from public.houses where owner_id = new.sender_id) then return null; end if;
  select state, house_owner_id into v_prev, v_prev_owner from public.conversation_handoff where conversation_id = new.conversation_id;
  insert into public.conversation_handoff (conversation_id, house_owner_id, state, handler_name, reason, since, updated_at)
  values (new.conversation_id, new.sender_id, 'humano', nullif(left(btrim(coalesce(new.staff_name, '')), 60), ''), null, now(), now())
  on conflict (conversation_id) do update
    set house_owner_id = excluded.house_owner_id, state = 'humano', handler_name = excluded.handler_name, reason = null,
        since = case when public.conversation_handoff.state = 'humano' and public.conversation_handoff.house_owner_id = excluded.house_owner_id
                     then public.conversation_handoff.since else now() end,
        updated_at = now();
  if v_prev is distinct from 'humano' or v_prev_owner is distinct from new.sender_id then
    insert into public.handoff_events (conversation_id, house_owner_id, action) values (new.conversation_id, new.sender_id, 'assumida');
  end if;
  return null;
end $$;
revoke all on function public.trg_messages_handoff() from public, anon, authenticated;
drop trigger if exists trg_messages_handoff on public.messages;
create trigger trg_messages_handoff after insert on public.messages
  for each row execute function public.trg_messages_handoff();

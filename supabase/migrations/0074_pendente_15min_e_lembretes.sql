-- 0074 — Conversa passada para a casa (pendente): vale no máximo 15 minutos e a casa recebe lembretes.
--  1) Passados 15 minutos sem a casa responder, a assistente volta a atender (a casa pode assumir a qualquer momento).
--  2) Enquanto a conversa está pendente, a casa recebe um lembrete a cada 4 minutos (no máximo 3 por passagem).
--  3) Se a assistente passar de novo depois disso, a casa é avisada de novo (o intervalo mínimo entre avisos cai de 30 para 10 minutos).

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

-- Lembretes: a cada 4 minutos, até 3 por passagem, só enquanto a conversa ainda está pendente (dentro dos 15 minutos).
create or replace function public.handoff_remind()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_client uuid; v_name text; v_min integer; v_n integer := 0;
begin
  for r in
    select h.conversation_id, h.house_owner_id, h.since, h.updated_at
      from public.conversation_handoff h
     where h.state = 'pendente' and h.updated_at > now() - interval '15 minutes' and h.updated_at <= now() - interval '4 minutes'
       and (select count(*) from public.handoff_events e where e.conversation_id = h.conversation_id and e.action = 'lembrete' and e.created_at >= h.updated_at) < 3
       and not exists (select 1 from public.handoff_events e where e.conversation_id = h.conversation_id and e.action = 'lembrete' and e.created_at > now() - interval '4 minutes')
     for update of h skip locked
  loop
    select cm.user_id into v_client from public.conversation_members cm where cm.conversation_id = r.conversation_id and cm.user_id <> r.house_owner_id limit 1;
    if v_client is null then continue; end if;
    select coalesce(nullif(btrim(p.display_name), ''), 'Um cliente') into v_name from public.profiles p where p.id = v_client;
    v_name := coalesce(v_name, 'Um cliente');
    v_min := greatest(1, floor(extract(epoch from (now() - r.updated_at)) / 60)::int);
    insert into public.notifications (user_id, text, href, kind)
    values (r.house_owner_id,
            v_name || ' ainda aguarda você há ' || v_min || ' min. Se você não responder, a assistente volta a atender em ' || greatest(1, 15 - v_min) || ' min.',
            '/mensagens/' || v_client, 'handoff');
    insert into public.handoff_events (conversation_id, house_owner_id, action) values (r.conversation_id, r.house_owner_id, 'lembrete');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.handoff_remind() from public, anon, authenticated;
grant execute on function public.handoff_remind() to service_role;

do $$
begin
  perform cron.schedule('handoff-remind', '* * * * *', 'select public.handoff_remind()');
exception when others then
  raise notice 'pg_cron indisponível: agende handoff_remind() a cada minuto manualmente';
end $$;

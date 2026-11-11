-- PASSO 39: 0075 — lembretes à casa: 4 min nos 3 primeiros, depois a cada 15 min, até 2 horas
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

create or replace function public.handoff_remind()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_client uuid; v_name text; v_min integer; v_wait text; v_n integer := 0;
begin
  for r in
    select h.conversation_id, h.house_owner_id, h.updated_at, c.n as sent
      from public.conversation_handoff h
      cross join lateral (select count(*) n from public.handoff_events e
                           where e.conversation_id = h.conversation_id and e.action = 'lembrete' and e.created_at >= h.updated_at) c
     where h.state = 'pendente' and h.updated_at > now() - interval '2 hours' and h.updated_at <= now() - interval '4 minutes'
       and not exists (select 1 from public.handoff_events e
                        where e.conversation_id = h.conversation_id and e.action = 'lembrete'
                          and e.created_at > now() - case when c.n < 3 then interval '4 minutes' else interval '15 minutes' end)
     for update of h skip locked
  loop
    select cm.user_id into v_client from public.conversation_members cm where cm.conversation_id = r.conversation_id and cm.user_id <> r.house_owner_id limit 1;
    if v_client is null then continue; end if;
    select coalesce(nullif(btrim(p.display_name), ''), 'Um cliente') into v_name from public.profiles p where p.id = v_client;
    v_name := coalesce(v_name, 'Um cliente');
    v_min := greatest(1, floor(extract(epoch from (now() - r.updated_at)) / 60)::int);
    v_wait := case when v_min < 60 then v_min || ' min' else (v_min / 60) || ' h' || case when v_min % 60 > 0 then ' ' || (v_min % 60) || ' min' else '' end end;
    insert into public.notifications (user_id, text, href, kind)
    values (r.house_owner_id,
            v_name || ' ainda aguarda você há ' || v_wait || '. A assistente continua atendendo enquanto você não responde.',
            '/mensagens/' || v_client, 'handoff');
    insert into public.handoff_events (conversation_id, house_owner_id, action) values (r.conversation_id, r.house_owner_id, 'lembrete');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.handoff_remind() from public, anon, authenticated;
grant execute on function public.handoff_remind() to service_role;

-- PASSO 37: 0074 — lembretes à casa enquanto a conversa aguarda (a cada 4 min, até 3)
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

-- Menos barulho: quem não precisa ser avisado não é avisado.
--  1) Resposta da assistente nunca gera aviso (o cliente já está na conversa; a casa vê no histórico).
--  2) Pergunta de cliente que a assistente atendeu (casa offline) não avisa a casa; se a assistente passar a conversa,
--     o aviso "precisa de você" continua existindo (feito pela função da assistente).
--  3) Mensagem direta (casa sem assistente, plano sem assistente ou assistente fora do ar) avisa normalmente.
-- Rode no SQL Editor. É seguro repetir.
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  sname text;
  v_href text;
begin
  if new.from_assistant then return new; end if;
  select nullif(btrim(p.display_name), '') into sname from public.profiles p where p.id = new.sender_id;
  sname := coalesce(sname, 'Alguém');
  v_href := '/mensagens/' || new.sender_id;
  for r in
    select cm.user_id, (p.account_type::text = 'casa') as is_house, coalesce(p.last_seen_at > now() - interval '3 minutes', false) as online
      from public.conversation_members cm join public.profiles p on p.id = cm.user_id
     where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id
  loop
    -- Gravada pela função da assistente (service_role), com a casa offline e assistente disponível: ela atende, sem aviso.
    if r.is_house and not r.online and coalesce(auth.role(), '') = 'service_role'
       and public.assistant_display_name(r.user_id) is not null then
      continue;
    end if;
    delete from public.notifications where user_id = r.user_id and href = v_href and read = false and text like '%enviou uma mensagem%';
    insert into public.notifications (user_id, text, href) values (r.user_id, sname || ' enviou uma mensagem.', v_href);
  end loop;
  return new;
end $$;

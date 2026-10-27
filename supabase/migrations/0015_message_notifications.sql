-- Sino para mensagens: quando alguém envia uma mensagem, a outra pessoa da conversa recebe um aviso
-- (a casa que está offline, com ou sem assistente; o cliente quando a casa responde pessoalmente).
-- Respostas da assistente não geram aviso (o cliente está no chat). Um aviso não lido por conversa:
-- o antigo é trocado por um novo, para o sino tocar de novo sem encher a lista.
-- Rode no SQL Editor. É seguro repetir.

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  sname text;
  v_href text;
begin
  select nullif(btrim(p.display_name), '') into sname from public.profiles p where p.id = new.sender_id;
  sname := coalesce(sname, 'Alguém');
  v_href := '/mensagens/' || new.sender_id;
  for r in
    select cm.user_id from public.conversation_members cm
     where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id
  loop
    delete from public.notifications
     where user_id = r.user_id and href = v_href and read = false and text like '%enviou uma mensagem%';
    insert into public.notifications (user_id, text, href)
    values (r.user_id, sname || ' enviou uma mensagem.', v_href);
  end loop;
  return new;
end $$;

revoke all on function public.notify_new_message() from public, anon, authenticated;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row when (new.from_assistant = false)
  execute function public.notify_new_message();

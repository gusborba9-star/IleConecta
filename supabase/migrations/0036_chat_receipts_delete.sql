-- Chat: ✓ enviado, ✓✓ entregue, ✓✓ colorido lido, e apagar mensagem para todos. Rode no SQL Editor. É seguro repetir.
-- Mensagens só mudam por estas funções (a tabela não tem política de UPDATE/DELETE para usuários).

alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

-- Entregue: o app do destinatário está aberto (chamado junto com a presença).
create or replace function public.mark_delivered()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.messages m set delivered_at = now()
  from public.conversation_members cm
  where cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
    and m.sender_id <> auth.uid() and m.delivered_at is null;
end $$;

-- Lida: o destinatário abriu a conversa.
create or replace function public.mark_conversation_read(p_conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = auth.uid()) then return; end if;
  update public.messages set read = true, delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conv and sender_id <> auth.uid() and read = false;
end $$;

-- Apagar para todos: só o autor, só mensagem própria (não da assistente), até 2 dias depois de enviada.
create or replace function public.delete_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  update public.messages set text = '[mensagem apagada]', deleted_at = now()
  where id = p_id and sender_id = auth.uid() and from_assistant = false and deleted_at is null
    and created_at > now() - interval '2 days';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Não foi possível apagar esta mensagem.'; end if;
end $$;

revoke all on function public.mark_delivered() from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.mark_delivered() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;

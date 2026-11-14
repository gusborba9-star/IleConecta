-- PASSO 196: 0106_conta_reutilizada — parte 4 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) correção: endereço da casa encerrada único de verdade ============
-- Antes usava só os 8 primeiros caracteres do id; duas casas com o mesmo começo de id travariam a exclusão (endereço duplicado).
-- Agora usa o id inteiro (mesma função de 0079, só essa linha muda).
create or replace function public.anonymize_account(p_user uuid, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare files jsonb; hid uuid;
begin
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Administrador não é excluído por aqui.'; end if;
  if not exists (select 1 from public.account_deletion_requests where id = p_request and user_id = p_user and status = 'pendente' and execute_after <= now()) then
    raise exception 'Pedido de exclusão inválido ou fora do prazo.';
  end if;
  if jsonb_array_length(public.account_deletion_blockers(p_user)) > 0 then raise exception 'Há impedimentos pendentes.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket, 'path', f.path)), '[]'::jsonb) into files from public.account_files(p_user) f;

  -- identidade retida (só administrador, 5 anos): autoria de aceites e transações continua identificável
  insert into public.deleted_account_identity (user_id, account_type, display_name, email, houses, request_id)
    select p_user, pr.account_type, pr.display_name, (select u.email from auth.users u where u.id = p_user),
           coalesce((select array_agg(h.name order by h.created_at) from public.houses h where h.owner_id = p_user), '{}'), p_request
      from public.profiles pr where pr.id = p_user and pr.deleted_at is null
    on conflict (user_id) do nothing;
  delete from public.message_archive a where a.sender_id = p_user
    and not exists (select 1 from public.support_cases c where c.conversation_id = a.conversation_id and c.status not in ('resolvido','recusado'));

  -- conteúdo e vínculos pessoais
  delete from public.notifications where user_id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.user_blocks where blocker_id = p_user or blocked_id = p_user;
  delete from public.follows where follower_id = p_user;
  delete from public.post_likes where user_id = p_user;
  delete from public.post_comments where user_id = p_user;
  delete from public.event_waitlist where user_id = p_user;
  delete from public.assistant_usage where user_id = p_user;
  delete from public.house_staff where user_id = p_user;
  delete from public.account_suspensions where user_id = p_user;
  update public.messages set text = '[mensagem removida]', attachment_path = null, attachment_type = null, attachment_name = null, attachment_size = null, action = null where sender_id = p_user;
  update public.reviews set comment = null, anonymous = true where author_id = p_user;
  update public.house_members set user_id = null, display_name = 'Conta excluída', note = null where user_id = p_user;
  -- respostas e observações podem conter dado sensível (convicção religiosa): saem, o registro financeiro fica
  update public.reservations set answers = '{}'::jsonb where user_id = p_user;
  update public.service_orders set note = null where client_id = p_user;
  update public.refund_requests set reason = null where client_id = p_user;
  update public.support_cases set subject_user = null where subject_user = p_user;

  -- casas da pessoa: saem do ar
  for hid in select id from public.houses where owner_id = p_user loop
    update public.services set active = false where house_id = hid;
    update public.events set status = 'cancelado' where house_id = hid and status in ('rascunho','publicado');
    delete from public.posts where house_id = hid;
    delete from public.stories where house_id = hid;
    delete from public.house_catalog_items where house_id = hid;
    delete from public.house_staff_invites where house_id = hid;
    delete from public.house_quick_replies where house_id = hid;
    delete from public.house_calendar_items where house_id = hid;
    delete from public.follows where house_id = hid;
    update public.assistants set enabled = false, instructions = null where house_id = hid;
    update public.houses set name = 'Casa encerrada', slug = 'encerrada-' || replace(id::text, '-', ''), category = 'Encerrada', tags = '{}', cover_url = null, offerings = '', verified = false where id = hid;
  end loop;

  update public.profiles set display_name = 'Conta excluída', avatar_url = null, bio = null, city = null, state = null, last_seen_at = null, deleted_at = now() where id = p_user;
  update public.account_deletion_requests set status = 'executada', executed_at = now() where id = p_request;
  insert into public.support_case_log (case_id, actor, action, data) values (null, null, 'conta_excluida', jsonb_build_object('usuario', p_user, 'pedido', p_request));
  return files;
end $$;

revoke all on function public.anonymize_account(uuid, uuid) from public, anon, authenticated;

grant execute on function public.anonymize_account(uuid, uuid) to service_role;

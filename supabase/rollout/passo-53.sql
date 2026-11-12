-- PASSO 53: 0079_ferramentas_de_conta — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.request_account_deletion(p_confirm text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b jsonb; rid uuid;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  if upper(btrim(coalesce(p_confirm, ''))) <> 'EXCLUIR' then raise exception 'Digite EXCLUIR para confirmar.'; end if;
  if public.is_suspended(me) then raise exception 'Conta suspensa: fale com o suporte.'; end if;
  b := public.account_deletion_blockers(me);
  if jsonb_array_length(b) > 0 then raise exception 'Ainda não é possível excluir: %', b ->> 0; end if;
  insert into public.account_deletion_requests (user_id) values (me) returning id into rid;
  insert into public.notifications (user_id, text, href) values (me, 'Pedido de exclusão registrado. Sua conta será excluída em 7 dias; você pode cancelar até lá.', '/perfil');
  return rid;
exception when unique_violation then
  raise exception 'Já existe um pedido de exclusão em andamento.';
end $$;

create or replace function public.cancel_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  update public.account_deletion_requests set status = 'cancelada', decided_at = now(), decided_by = auth.uid() where user_id = auth.uid() and status = 'pendente';
  if not found then raise exception 'Não há pedido de exclusão em andamento.'; end if;
end $$;

-- Administrador: recusa (com motivo) ou antecipa a execução a pedido da própria pessoa registrado no chamado.
create or replace function public.admin_decide_account_deletion(p_request uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.account_deletion_requests;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_action not in ('recusar','antecipar') then raise exception 'Ação inválida.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
  select * into d from public.account_deletion_requests where id = p_request for update;
  if not found or d.status <> 'pendente' then raise exception 'Pedido não encontrado ou já decidido.'; end if;
  if p_action = 'recusar' then
    update public.account_deletion_requests set status = 'recusada', decision_note = left(btrim(p_reason), 500), decided_by = auth.uid(), decided_at = now() where id = p_request;
    insert into public.notifications (user_id, text, href) values (d.user_id, 'Seu pedido de exclusão não foi aceito. Veja o motivo no chamado.', '/suporte');
  else
    if jsonb_array_length(public.account_deletion_blockers(d.user_id)) > 0 then raise exception 'Há impedimentos pendentes para esta exclusão.'; end if;
    update public.account_deletion_requests set execute_after = now(), decision_note = left(btrim(p_reason), 500), decided_by = auth.uid() where id = p_request;
  end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (null, auth.uid(), 'exclusao_' || p_action, left(btrim(p_reason), 300), jsonb_build_object('pedido', p_request, 'usuario', d.user_id));
end $$;

-- Para a função de borda: quem já passou do prazo. Sem impedimento novo, segue; com impedimento, o pedido é recusado.
create or replace function public.account_deletions_due()
returns table (request_id uuid, user_id uuid)
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  for d in select * from public.account_deletion_requests where status = 'pendente' and execute_after <= now() order by execute_after limit 20 loop
    if jsonb_array_length(public.account_deletion_blockers(d.user_id)) > 0 then
      update public.account_deletion_requests set status = 'recusada', decided_at = now(), decision_note = 'Impedimento surgiu antes da execução: ' || left(public.account_deletion_blockers(d.user_id) ->> 0, 300) where id = d.id;
      insert into public.notifications (user_id, text, href) values (d.user_id, 'Sua exclusão não foi feita: ' || left(public.account_deletion_blockers(d.user_id) ->> 0, 200), '/suporte');
    else
      request_id := d.id; user_id := d.user_id; return next;
    end if;
  end loop;
end $$;

-- Arquivos da pessoa (e da casa) que a função de borda precisa apagar do armazenamento.
create or replace function public.account_files(p_user uuid)
returns table (bucket text, path text)
language sql stable security definer set search_path = public as $$
  select 'chat-files'::text, m.attachment_path from public.messages m where m.sender_id = p_user and m.attachment_path is not null
  union
  select o.bucket_id, o.name from storage.objects o where o.bucket_id = 'report-evidence' and (storage.foldername(o.name))[1] = p_user::text
  union
  select o.bucket_id, o.name from storage.objects o where o.bucket_id in ('avatars','images','post-images') and (storage.foldername(o.name))[1] = p_user::text;
$$;

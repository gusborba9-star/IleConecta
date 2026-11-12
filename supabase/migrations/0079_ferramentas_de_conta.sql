-- 0079 — Suporte: ferramentas de conta (e-mail de contato, suspensão, exportação de dados, exclusão de conta).
-- Exclusão = anonimização: a conta deixa de existir para as pessoas, os dados pessoais e o conteúdo são apagados e os registros
-- financeiros e os aceites dos Termos ficam, sem nome (a lei exige guardar; ver docs/legal/POLITICA_RETENCAO_E_EXCLUSAO.md).
-- A parte de autenticação (senha, e-mail de login, bloqueio de entrada) é feita pela função de borda "support-admin".
-- É seguro repetir.

-- ============ 1) e-mail de contato do suporte (editável no painel) ============
create table if not exists public.support_contact (
  id boolean primary key default true check (id),
  email text not null check (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.support_contact enable row level security;
revoke all on public.support_contact from anon, authenticated;
insert into public.support_contact (id, email) values (true, 'gusborba9@gmail.com') on conflict (id) do nothing;

create or replace function public.support_contact_email()
returns text language sql stable security definer set search_path = public as $$
  select email from public.support_contact where id;
$$;

create or replace function public.admin_set_support_email(p_email text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare old_email text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo da troca.'; end if;
  if p_email is null or char_length(btrim(p_email)) > 120 or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  select email into old_email from public.support_contact where id;
  insert into public.support_contact (id, email, updated_by) values (true, lower(btrim(p_email)), auth.uid())
    on conflict (id) do update set email = excluded.email, updated_at = now(), updated_by = auth.uid();
  insert into public.support_case_log (case_id, actor, action, reason, data)
    values (null, auth.uid(), 'email_contato_alterado', left(btrim(p_reason), 300), jsonb_build_object('de', old_email, 'para', lower(btrim(p_email))));
end $$;

-- ============ 2) suspensão reversível ============
create table if not exists public.account_suspensions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 500),
  case_id uuid,
  suspended_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz not null default now()
);
alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from anon, authenticated;

create or replace function public.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_suspensions where user_id = p_user);
$$;
revoke all on function public.is_suspended(uuid) from public, anon, authenticated;

-- Conta suspensa não envia mensagem, não publica, não reserva, não contrata e não avalia. Continua podendo falar com o suporte.
create or replace function public.reject_suspended_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); uid uuid;
begin
  uid := case tg_table_name
    when 'messages' then (j ->> 'sender_id')::uuid
    when 'reservations' then (j ->> 'user_id')::uuid
    when 'service_orders' then (j ->> 'client_id')::uuid
    when 'reviews' then (j ->> 'author_id')::uuid
    when 'post_comments' then (j ->> 'user_id')::uuid
    when 'posts' then (select h.owner_id from public.houses h where h.id = (j ->> 'house_id')::uuid)
    when 'events' then (select h.owner_id from public.houses h where h.id = (j ->> 'house_id')::uuid)
    when 'services' then (select h.owner_id from public.houses h where h.id = (j ->> 'house_id')::uuid)
  end;
  if uid is not null and exists (select 1 from public.account_suspensions where user_id = uid) then
    raise exception 'Sua conta está suspensa. Fale com o suporte para entender o motivo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['messages','reservations','service_orders','reviews','post_comments','posts','events','services'] loop
    execute format('drop trigger if exists trg_reject_suspended on public.%I', t);
    execute format('create trigger trg_reject_suspended before insert on public.%I for each row execute function public.reject_suspended_actor()', t);
  end loop;
end $$;

create or replace function public.admin_suspend_account(p_user uuid, p_reason text, p_case uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 or char_length(p_reason) > 500 then raise exception 'Informe o motivo (10 a 500 caracteres).'; end if;
  if p_user = auth.uid() then raise exception 'Você não pode suspender a própria conta.'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Administrador não é suspenso por aqui.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null) then raise exception 'Conta não encontrada.'; end if;
  insert into public.account_suspensions (user_id, reason, case_id, suspended_by) values (p_user, btrim(p_reason), p_case, auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, case_id = excluded.case_id, suspended_by = excluded.suspended_by, suspended_at = now();
  insert into public.support_case_log (case_id, actor, action, reason, data) values (p_case, auth.uid(), 'conta_suspensa', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user));
  insert into public.notifications (user_id, text, href) values (p_user, 'Sua conta foi suspensa. Fale com o suporte para entender o motivo.', '/suporte');
end $$;

create or replace function public.admin_unsuspend_account(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
  delete from public.account_suspensions where user_id = p_user;
  if not found then raise exception 'Esta conta não está suspensa.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (null, auth.uid(), 'conta_reativada', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user));
  insert into public.notifications (user_id, text, href) values (p_user, 'Sua conta foi reativada.', '/');
end $$;

-- ============ 3) exportação dos próprios dados ============
alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  return jsonb_build_object(
    'gerado_em', now(),
    'perfil', (select to_jsonb(p) - 'id' from public.profiles p where p.id = me),
    'casas', coalesce((select jsonb_agg(jsonb_build_object('nome', h.name, 'categoria', h.category, 'plano', h.plan, 'criada_em', h.created_at)) from public.houses h where h.owner_id = me), '[]'::jsonb),
    'aceites', coalesce((select jsonb_agg(jsonb_build_object('documento', c.doc_key, 'versao', c.doc_version, 'em', c.accepted_at) order by c.accepted_at) from public.legal_consents c where c.user_id = me), '[]'::jsonb),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('ritual', e.title, 'status', r.status, 'respostas', r.answers, 'em', r.created_at) order by r.created_at) from public.reservations r join public.events e on e.id = r.event_id where r.user_id = me), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('servico', o.title, 'valor_centavos', o.price_cents, 'status', o.status, 'observacao', o.note, 'em', o.created_at) order by o.created_at) from public.service_orders o where o.client_id = me), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('valor_centavos', p.gross_cents, 'status', p.status, 'metodo', p.payment_method, 'em', p.created_at) order by p.created_at)
        from public.payments p left join public.reservations r on r.id = p.reservation_id left join public.service_orders o on o.id = p.order_id where coalesce(r.user_id, o.client_id) = me), '[]'::jsonb),
    'reembolsos', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.kind, 'status', f.status, 'valor_centavos', f.amount_cents, 'motivo', f.reason, 'em', f.created_at) order by f.created_at) from public.refund_requests f where f.client_id = me), '[]'::jsonb),
    'mensagens_enviadas', coalesce((select jsonb_agg(jsonb_build_object('texto', m.text, 'em', m.created_at) order by m.created_at) from public.messages m where m.sender_id = me and m.deleted_at is null and not m.from_assistant), '[]'::jsonb),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object('texto', c.text, 'em', c.created_at) order by c.created_at) from public.post_comments c where c.user_id = me), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('nota', r.rating, 'comentario', r.comment, 'em', r.created_at) order by r.created_at) from public.reviews r where r.author_id = me), '[]'::jsonb),
    'casas_que_segue', coalesce((select jsonb_agg(h.name) from public.follows f join public.houses h on h.id = f.house_id where f.follower_id = me), '[]'::jsonb),
    'chamados', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.kind, 'titulo', c.title, 'descricao', c.description, 'status', c.status, 'em', c.created_at) order by c.created_at) from public.support_cases c where c.opened_by = me), '[]'::jsonb));
end $$;

-- ============ 4) exclusão de conta ============
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','cancelada','executada','recusada')),
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null default (now() + interval '7 days'),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_at timestamptz,
  executed_at timestamptz
);
create unique index if not exists account_deletion_one_pending on public.account_deletion_requests (user_id) where status = 'pendente';
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

-- O que ainda impede a exclusão (dinheiro, reembolso ou atendimento em andamento). Vazio = pode excluir.
create or replace function public.account_deletion_blockers(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b jsonb := '[]'::jsonb;
begin
  if exists (select 1 from public.admins where user_id = p_user) then b := b || '["Conta de administrador: peça a remoção do acesso de administrador primeiro."]'::jsonb; end if;
  if exists (select 1 from public.refund_requests f where f.client_id = p_user and f.status in ('pendente','aprovado')) then b := b || '["Há um pedido de reembolso seu em andamento."]'::jsonb; end if;
  if exists (select 1 from public.service_orders o where o.client_id = p_user and o.status in ('confirmado','em_andamento','reembolso_pendente')) then b := b || '["Há um serviço contratado em andamento."]'::jsonb; end if;
  if exists (select 1 from public.reservations r join public.events e on e.id = r.event_id where r.user_id = p_user and r.status in ('confirmada','reembolso_pendente') and e.starts_at > now() - interval '1 day') then b := b || '["Há uma reserva de ritual confirmada que ainda não aconteceu."]'::jsonb; end if;
  if exists (select 1 from public.payments p left join public.reservations r on r.id = p.reservation_id left join public.service_orders o on o.id = p.order_id
              where coalesce(r.user_id, o.client_id) = p_user and p.status = 'pendente' and (p.pix_expires_at is null or p.pix_expires_at > now())) then b := b || '["Há um pagamento seu em andamento."]'::jsonb; end if;
  if exists (select 1 from public.houses h where h.owner_id = p_user) then
    if exists (select 1 from public.service_orders o join public.houses h on h.id = o.house_id where h.owner_id = p_user and o.status in ('confirmado','em_andamento','reembolso_pendente')) then b := b || '["Sua casa tem serviços contratados em andamento."]'::jsonb; end if;
    if exists (select 1 from public.refund_requests f join public.houses h on h.id = f.house_id where h.owner_id = p_user and f.status in ('pendente','aprovado')) then b := b || '["Sua casa tem reembolsos em andamento."]'::jsonb; end if;
    if exists (select 1 from public.reservations r join public.events e on e.id = r.event_id join public.houses h on h.id = e.house_id
                where h.owner_id = p_user and r.status in ('confirmada','reembolso_pendente') and e.starts_at > now() - interval '1 day' and e.status <> 'cancelado') then b := b || '["Sua casa tem rituais com reservas confirmadas que ainda não aconteceram. Cancele-os (com reembolso) antes."]'::jsonb; end if;
  end if;
  return b;
end $$;
revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;

create or replace function public.my_account_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suspensa', public.is_suspended(auth.uid()),
    'exclusao', (select jsonb_build_object('id', d.id, 'executa_em', d.execute_after) from public.account_deletion_requests d where d.user_id = auth.uid() and d.status = 'pendente'),
    'impedimentos', public.account_deletion_blockers(auth.uid()));
$$;

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

-- Anonimiza a conta. Só a função de borda executa (permissão apenas para service_role). Exige pedido vencido e sem impedimentos.
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
    update public.houses set name = 'Casa encerrada', slug = 'encerrada-' || substr(id::text, 1, 8), category = 'Encerrada', tags = '{}', cover_url = null, offerings = '', verified = false where id = hid;
  end loop;

  update public.profiles set display_name = 'Conta excluída', avatar_url = null, bio = null, city = null, state = null, last_seen_at = null, deleted_at = now() where id = p_user;
  update public.account_deletion_requests set status = 'executada', executed_at = now() where id = p_request;
  insert into public.support_case_log (case_id, actor, action, data) values (null, null, 'conta_excluida', jsonb_build_object('usuario', p_user, 'pedido', p_request));
  return files;
end $$;

-- ============ 5) permissões ============
revoke all on function public.support_contact_email(), public.admin_set_support_email(text, text), public.admin_suspend_account(uuid, text, uuid), public.admin_unsuspend_account(uuid, text),
  public.export_my_data(), public.my_account_status(), public.request_account_deletion(text), public.cancel_account_deletion(), public.admin_decide_account_deletion(uuid, text, text),
  public.account_deletions_due(), public.account_files(uuid), public.anonymize_account(uuid, uuid), public.reject_suspended_actor() from public, anon, authenticated;
grant execute on function public.support_contact_email() to anon, authenticated;
grant execute on function public.admin_set_support_email(text, text), public.admin_suspend_account(uuid, text, uuid), public.admin_unsuspend_account(uuid, text),
  public.export_my_data(), public.my_account_status(), public.request_account_deletion(text), public.cancel_account_deletion(), public.admin_decide_account_deletion(uuid, text, text) to authenticated;
grant execute on function public.account_deletions_due(), public.account_files(uuid), public.anonymize_account(uuid, uuid) to service_role;

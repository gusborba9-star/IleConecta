-- 0106 — Conta reutilizada (decisão do proprietário, 13/11/2026, opção B): quem volta com o e-mail de uma conta excluída é MARCADO, sem ser impedido.
--  (1) a marca usa o registro de identidade que já é retido por 5 anos (deleted_account_identity); não há dado novo guardado;
--  (2) o e-mail é comparado em forma normalizada (minúsculas, sem "+apelido", sem pontos em gmail), para não ser driblado por variação simples;
--  (3) conta reutilizada NÃO inclui o reembolso de 7 dias do plano (decisão do proprietário; no servidor), com a mensagem "Conta reutilizada: o reembolso de 7 dias não está incluído.";
--  (4) o administrador vê a lista de contas reutilizadas, consulta o histórico retido (motivo obrigatório, fica registrado) e envia aviso
--      pela plataforma com texto-modelo neutro (só fatos do registro; o e-mail pode ter sido reaproveitado por outra pessoa).

-- ============ 1) comparação de e-mail ============
create or replace function public.email_key(p_email text) returns text
language sql immutable parallel safe set search_path = public as $$
select case when p_email is null or position('@' in p_email) = 0 then null else
  case when split_part(lower(btrim(p_email)), '@', 2) in ('gmail.com', 'googlemail.com')
    then replace(split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1) || '@' || split_part(lower(btrim(p_email)), '@', 2) end
end;
$$;

create index if not exists deleted_account_identity_email_key on public.deleted_account_identity (public.email_key(email));

-- identidades excluídas com o mesmo e-mail (normalizado) de uma conta atual
create or replace function public.account_prior_deleted(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
select di.user_id from public.deleted_account_identity di
where di.user_id <> p_user and di.email is not null
  and public.email_key(di.email) = public.email_key((select u.email from auth.users u where u.id = p_user));
$$;

-- a casa pertence a quem já teve uma conta excluída com o mesmo e-mail?
create or replace function public.house_owner_is_returning(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from public.houses h, lateral public.account_prior_deleted(h.owner_id) pd(uid) where h.id = p_house);
$$;

-- ============ 2) reembolso de 7 dias com a nova regra ============
create or replace function public.platform_plan_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; r public.platform_plan_refunds; v_first uuid; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'plan' or c.status <> 'paga' then raise exception 'Esta cobrança não pode ser reembolsada.'; end if;
if public.house_owner_is_returning(p_house) then raise exception 'Conta reutilizada: o reembolso de 7 dias não está incluído.'; end if;
select * into r from public.platform_plan_refunds where house_id = p_house and status in ('pendente', 'concluido');
if found then
if r.charge_id <> p_charge then raise exception 'O reembolso de 7 dias do plano já foi usado por esta casa.'; end if;
if r.status = 'concluido' then raise exception 'Esta cobrança já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
select id into v_first from public.platform_charges where house_id = p_house and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
if v_first is distinct from p_charge then raise exception 'O reembolso de 7 dias vale só para o primeiro pagamento do plano.'; end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
insert into public.platform_plan_refunds (charge_id, house_id, amount_cents, provider, requested_by) values (c.id, c.house_id, c.paid_amount_cents, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', c.paid_amount_cents, 'resume', false);
end $$;

create or replace function public.my_plan_refund() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; v_first public.platform_charges;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'eligible', false, 'window_days', 7, 'history', '[]'::jsonb); end if;
select * into v_first from public.platform_charges where house_id = h and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
return jsonb_build_object('has_house', true, 'window_days', 7,
'cancelled', coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false),
'eligible', v_first.id is not null and v_first.status = 'paga' and v_first.paid_at + interval '7 days' >= now() and v_first.paid_amount_cents is not null and v_first.paid_ref is not null
and not exists (select 1 from public.platform_plan_refunds r where r.house_id = h and r.status in ('pendente', 'concluido'))
and not public.house_owner_is_returning(h),
'returning', public.house_owner_is_returning(h),
'charge_id', case when v_first.status = 'paga' then v_first.id end, 'amount_cents', v_first.paid_amount_cents, 'deadline', v_first.paid_at + interval '7 days',
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_plan_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

-- ============ 3) painel do administrador ============
create or replace function public.admin_returning_accounts()
returns table (user_id uuid, account_type text, display_name text, email_masked text, joined_at timestamptz, houses text[], prior_count integer, last_deleted_at timestamptz, refund_used boolean, prior_charges integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
  select p.id, p.account_type::text, p.display_name,
    left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2),
    u.created_at,
    coalesce((select array_agg(h.name order by h.created_at) from public.houses h where h.owner_id = p.id), '{}'),
    (select count(*)::int from public.account_prior_deleted(p.id)),
    (select max(di.deleted_at) from public.deleted_account_identity di where di.user_id in (select public.account_prior_deleted(p.id))),
    exists (select 1 from public.platform_plan_refunds r join public.houses ph on ph.id = r.house_id where ph.owner_id in (select public.account_prior_deleted(p.id)) and r.status in ('pendente', 'concluido')),
    (select count(*)::int from public.platform_charges c join public.houses ph on ph.id = c.house_id where ph.owner_id in (select public.account_prior_deleted(p.id)))
  from public.profiles p join auth.users u on u.id = p.id
  where p.deleted_at is null and exists (select 1 from public.account_prior_deleted(p.id))
  order by 5 desc;
end $$;

create or replace function public.admin_returning_history(p_user uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da consulta (mínimo de 10 caracteres).'; end if;
  select coalesce(array_agg(x), '{}') into ids from public.account_prior_deleted(p_user) x;
  if cardinality(ids) = 0 then raise exception 'Esta conta não tem histórico de conta excluída.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (null, auth.uid(), 'historico_conta_reutilizada', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user, 'contas_anteriores', ids));
  return jsonb_build_object(
    'identidades', coalesce((select jsonb_agg(jsonb_build_object('nome', di.display_name, 'tipo', di.account_type, 'casas', di.houses, 'excluida_em', di.deleted_at, 'guardada_ate', di.retain_until) order by di.deleted_at) from public.deleted_account_identity di where di.user_id = any (ids)), '[]'::jsonb),
    'cobrancas', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.kind, 'descricao', left(c.description, 120), 'valor_cents', c.amount_cents, 'vencimento', c.due_date, 'status', c.status, 'paga_em', c.paid_at) order by c.due_date desc)
      from (select c.* from public.platform_charges c join public.houses h on h.id = c.house_id where h.owner_id = any (ids) order by c.due_date desc limit 50) c), '[]'::jsonb),
    'reembolsos_do_plano', coalesce((select jsonb_agg(jsonb_build_object('valor_cents', r.amount_cents, 'status', r.status, 'em', r.created_at) order by r.created_at desc)
      from public.platform_plan_refunds r join public.houses h on h.id = r.house_id where h.owner_id = any (ids)), '[]'::jsonb),
    'aceites', coalesce((select jsonb_agg(jsonb_build_object('documento', l.doc_key, 'versao', l.doc_version, 'em', l.accepted_at) order by l.accepted_at desc)
      from (select * from public.legal_consents where user_id = any (ids) order by accepted_at desc limit 30) l), '[]'::jsonb),
    'chamados', coalesce((select jsonb_agg(jsonb_build_object('tipo', s.kind, 'status', s.status, 'aberto_em', s.created_at) order by s.created_at desc)
      from (select * from public.support_cases where opened_by = any (ids) or subject_user = any (ids) order by created_at desc limit 30) s), '[]'::jsonb));
end $$;

create or replace function public.admin_notify_returning(p_user uuid, p_template text, p_note text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_text text; v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo do aviso (mínimo de 10 caracteres).'; end if;
  if not exists (select 1 from public.account_prior_deleted(p_user)) then raise exception 'Esta conta não tem histórico de conta excluída.'; end if;
  if char_length(v_note) > 300 then raise exception 'A observação deve ter até 300 caracteres.'; end if;
  if p_template = 'reembolso_nao_incluso' then
    v_text := 'Conta reutilizada: este e-mail já esteve vinculado a uma conta excluída e, por isso, o reembolso de 7 dias do plano não está incluído. Se tiver dúvida, fale com o suporte.';
  elsif p_template = 'registros_anteriores' then
    v_text := 'Existem registros de uma conta anterior vinculada a este e-mail. Se você acha que isso é um engano, fale com o suporte.';
  elsif p_template = 'livre' then
    if char_length(v_note) < 20 then raise exception 'No aviso livre, escreva de 20 a 300 caracteres.'; end if;
    v_text := v_note; v_note := '';
  else
    raise exception 'Modelo de aviso inválido.';
  end if;
  if v_note <> '' then v_text := v_text || ' Observação: ' || v_note; end if;
  insert into public.notifications (user_id, text, href) values (p_user, v_text, '/suporte');
  insert into public.support_case_log (case_id, actor, action, reason, data) values (null, auth.uid(), 'aviso_conta_reutilizada', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user, 'modelo', p_template));
end $$;

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

-- ============ 5) permissões ============
revoke all on function public.email_key(text), public.account_prior_deleted(uuid), public.house_owner_is_returning(uuid),
  public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.my_plan_refund(),
  public.admin_returning_accounts(), public.admin_returning_history(uuid, text), public.admin_notify_returning(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.email_key(text), public.account_prior_deleted(uuid), public.house_owner_is_returning(uuid),
  public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.my_plan_refund() to authenticated, service_role;
grant execute on function public.admin_returning_accounts(), public.admin_returning_history(uuid, text), public.admin_notify_returning(uuid, text, text, text) to authenticated, service_role;

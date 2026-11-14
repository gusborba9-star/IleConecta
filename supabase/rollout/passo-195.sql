-- PASSO 195: 0106_conta_reutilizada — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
  if p_template = 'reembolso_usado' then
    v_text := 'O reembolso integral de 7 dias do plano já foi utilizado em uma conta anterior vinculada a este e-mail e, por isso, não se aplica a esta conta. Se tiver dúvida, fale com o suporte.';
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

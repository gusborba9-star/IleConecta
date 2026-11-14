-- PASSO 194: 0106_conta_reutilizada — parte 2 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

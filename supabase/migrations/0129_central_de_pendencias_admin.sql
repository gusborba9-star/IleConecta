-- 0129 — Central de pendências da administração (Fase 5). SÓ LEITURA.
-- Junta, numa lista única, o que está esperando ação da administração, lendo as tabelas originais na hora
-- (sem cópia, sem tabela nova). Cada linha aponta para a origem (kind + ref_id) e para a tela onde se resolve (tab).
-- Prazos padrão (horas) ficam em pending_deadline_hours(): fonte única, para o painel e os testes.

-- ============ 1) prazos padrão por tipo ============
create or replace function public.pending_deadline_hours(p_kind text)
returns integer language sql immutable set search_path = public as $$
  select case p_kind
    when 'denuncia_chat' then 72
    when 'avaliacao_denunciada' then 120
    when 'moderacao_pendente' then 72
    when 'moderacao_contestada' then 72
    when 'reembolso_cliente' then 48
    when 'reembolso_aprovado' then 24
    when 'reembolso_plataforma' then 2
    when 'cobranca_travada' then 72
    else null end;
$$;

-- ============ 1b) avaliação denunciada: encerrar a denúncia sem esconder ============
-- Antes só dava para esconder; mantida visível, a denúncia ficaria pendente para sempre.
alter table public.reviews add column if not exists report_reviewed_at timestamptz;

create or replace function public.admin_review_report_keep(p_review uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.reviews set report_reviewed_at = now() where id = p_review and reported_at is not null;
  if not found then raise exception 'review_not_reported' using errcode = 'P0002'; end if;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
  values (auth.uid(), 'review_report_kept', null, jsonb_build_object('review', p_review));
end $$;

-- Endurecimento: depois que a administração encerra a denúncia mantendo a avaliação, a casa não contesta de novo
-- (evita reabrir a mesma pendência sem fim). Escondida ou não, uma avaliação já analisada não volta à fila.
create or replace function public.report_review(p_review uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_reviewed timestamptz; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then raise exception 'Explique o motivo em 5 a 300 caracteres.'; end if;
  select h.owner_id, r.report_reviewed_at into v_owner, v_reviewed from public.reviews r join public.houses h on h.id = r.house_id where r.id = p_review;
  if v_owner is null or v_owner is distinct from auth.uid() then raise exception 'Só a casa avaliada pode contestar.'; end if;
  if v_reviewed is not null then raise exception 'A administração já analisou a contestação desta avaliação.'; end if;
  update public.reviews set reported_at = now(), report_reason = v_reason where id = p_review;
end $$;

-- A lista do painel passa a informar se a denúncia já foi analisada.
create or replace function public.admin_reported_reviews()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'house', h.name, 'rating', r.rating, 'comment', r.comment, 'report_reason', r.report_reason,
      'reported_at', r.reported_at, 'hidden', r.hidden, 'reviewed_at', r.report_reviewed_at) order by r.reported_at desc)
    from public.reviews r join public.houses h on h.id = r.house_id where r.reported_at is not null), '[]'::jsonb);
end $$;

-- ============ 2) a central ============
create or replace function public.admin_pending_center()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  with src as (
    -- suporte: chamados que esperam a administração (os "aguardando" esperam outra pessoa e ficam de fora)
    select 'suporte'::text kind, c.id ref_id, c.house_id, c.title, c.kind::text detail, c.priority::text priority,
           case when c.first_response_at is null then c.first_response_due end due_at, c.created_at since, 'suporte'::text tab
      from public.support_cases c where c.status in ('aberto', 'em_analise')
    union all
    -- moderação: fila de promessas
    select 'moderacao', f.id, f.house_id, left(coalesce(f.excerpt, f.reason, 'Conteúdo sinalizado'), 120), f.status::text,
           case when f.status = 'contestada' then 'alta' when f.status in ('orientada', 'advertida') and f.deadline_at < now() then 'alta' else 'normal' end,
           case f.status
             when 'pendente' then f.created_at + make_interval(hours => public.pending_deadline_hours('moderacao_pendente'))
             when 'contestada' then f.contested_at + make_interval(hours => public.pending_deadline_hours('moderacao_contestada'))
             else f.deadline_at end,
           f.created_at, 'moderacao'
      from public.moderation_flags f
     where f.status in ('pendente', 'contestada') or (f.status in ('orientada', 'advertida') and f.deadline_at < now())
    union all
    select 'denuncia_chat', r.id, null, left(coalesce(r.reason, 'Denúncia de conversa'), 120), r.status::text, 'alta',
           r.created_at + make_interval(hours => public.pending_deadline_hours('denuncia_chat')), r.created_at, 'denuncias'
      from public.chat_reports r where r.status = 'aberta'
    union all
    select 'avaliacao_denunciada', v.id, v.house_id, left(coalesce(v.report_reason, 'Avaliação denunciada'), 120), case when v.hidden then 'oculta' else 'visivel' end, 'normal',
           v.reported_at + make_interval(hours => public.pending_deadline_hours('avaliacao_denunciada')), v.reported_at, 'avaliacoes'
      from public.reviews v where v.reported_at is not null and not coalesce(v.hidden, false)
       and (v.report_reviewed_at is null or v.report_reviewed_at < v.reported_at)
    union all
    select 'exclusao_conta', a.id, null, 'Pedido de exclusão de conta', a.status::text, 'normal', a.execute_after, a.requested_at, 'suporte'
      from public.account_deletion_requests a where a.status = 'pendente'
    union all
    -- reembolso do cliente: pendente (decidir) e aprovado e ainda não concluído (dinheiro parado)
    select 'reembolso_cliente', q.id, q.house_id, 'Reembolso de R$ ' || replace(to_char(q.amount_cents / 100.0, 'FM9999990.00'), '.', ','), q.status::text, 'alta',
           case when q.status = 'pendente' then q.created_at + make_interval(hours => public.pending_deadline_hours('reembolso_cliente'))
                else coalesce(q.decided_at, q.created_at) + make_interval(hours => public.pending_deadline_hours('reembolso_aprovado')) end,
           q.created_at, 'financeiro'
      from public.refund_requests q where q.status in ('pendente', 'aprovado') and q.completed_at is null
    union all
    -- reembolsos da plataforma (plano, vaga, créditos, destaque): "falhou" sempre; "pendente" só se parado há mais do prazo
    select 'reembolso_plataforma', x.id, x.house_id, 'Reembolso de ' || x.rk || ' de R$ ' || replace(to_char(x.amount_cents / 100.0, 'FM9999990.00'), '.', ','), x.status::text, 'alta',
           x.created_at + make_interval(hours => public.pending_deadline_hours('reembolso_plataforma')), x.created_at, 'cobranca'
      from (
        select id, house_id, amount_cents, status, created_at, 'plano' rk from public.platform_plan_refunds
        union all select id, house_id, amount_cents, status, created_at, 'vaga' from public.platform_seat_refunds
        union all select id, house_id, amount_cents, status, created_at, 'créditos' from public.platform_credit_refunds
        union all select id, house_id, amount_cents, status, created_at, 'destaque' from public.promo_refunds
      ) x
     where x.status = 'falhou'
        or (x.status = 'pendente' and x.created_at < now() - make_interval(hours => public.pending_deadline_hours('reembolso_plataforma')))
    union all
    -- cobrança em processamento há muito tempo (pagamento que não confirmou)
    select 'cobranca_travada', p.id, p.house_id, p.description, p.status::text, 'alta',
           p.updated_at + make_interval(hours => public.pending_deadline_hours('cobranca_travada')), p.updated_at, 'cobranca'
      from public.platform_charges p
     where p.status = 'em_processamento' and p.updated_at < now() - make_interval(hours => public.pending_deadline_hours('cobranca_travada'))
    union all
    -- pedido preso em reembolso pendente
    select 'pedido_reembolso', o.id, o.house_id, left(o.title, 120), o.status::text, 'alta',
           o.updated_at + make_interval(hours => public.pending_deadline_hours('reembolso_cliente')), o.updated_at, 'financeiro'
      from public.service_orders o
     where o.status = 'reembolso_pendente'
       and not exists (select 1 from public.refund_requests q where q.order_id = o.id and q.status in ('pendente', 'aprovado') and q.completed_at is null)
  ), ranked as (
    select s.*, h.name house_name, (s.due_at is not null and s.due_at < now()) overdue
      from src s left join public.houses h on h.id = s.house_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'total', (select count(*) from ranked),
    'overdue', (select count(*) from ranked where overdue),
    'counts', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from ranked group by kind) c),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'ref_id', r.ref_id, 'house_id', r.house_id, 'house_name', r.house_name,
        'title', r.title, 'detail', r.detail, 'priority', r.priority, 'due_at', r.due_at, 'overdue', r.overdue, 'since', r.since, 'tab', r.tab)
        order by r.overdue desc, case r.priority when 'urgente' then 0 when 'alta' then 1 else 2 end, r.due_at nulls last, r.since), '[]'::jsonb)
      from (select * from ranked order by overdue desc, case priority when 'urgente' then 0 when 'alta' then 1 else 2 end, due_at nulls last, since limit 300) r),
    'scope', 'Lê as tabelas originais na hora; não guarda cópia. Mostra até 300 itens, os mais urgentes primeiro.')
  into res;
  return res;
end $$;

-- ============ 3) permissões ============
revoke all on function public.admin_reported_reviews(), public.report_review(uuid,text), public.pending_deadline_hours(text), public.admin_pending_center(), public.admin_review_report_keep(uuid) from public, anon, authenticated;
grant execute on function public.pending_deadline_hours(text) to service_role;
grant execute on function public.admin_reported_reviews(), public.report_review(uuid,text), public.admin_pending_center(), public.admin_review_report_keep(uuid) to authenticated;

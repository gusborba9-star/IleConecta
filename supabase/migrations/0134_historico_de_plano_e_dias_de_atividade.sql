-- 0134 — Histórico de plano e dias de atividade (Fase 5). Indicadores exatos para a administração.
-- (a) house_plan_history: toda troca de plano da casa, por qualquer caminho (gatilho em houses). Motivos: inicio, subiu, rebaixou, cancelou, admin.
--     Casas que já existiam entram com uma linha "inicio" no plano de hoje (histórico anterior não existe; é exato daqui para a frente).
-- (b) user_activity_days: um dia por pessoa (data em Brasília), gravado pelo batimento de presença. Sem conteúdo, tela ou horário. Some junto com a conta (anonymize_account) e vai no "baixar meus dados".
-- (c) admin_indicators passa a usar os dois: cancelamentos, conversão e retenção exatas, ativos do período com comparação.
-- Tabelas só pelo servidor: RLS ligada, sem política, sem permissão para anon/authenticated.

-- ============ a) histórico de plano ============
create table if not exists public.house_plan_history (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  from_plan text,
  to_plan text not null,
  reason text not null check (reason in ('inicio', 'subiu', 'rebaixou', 'cancelou', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists house_plan_history_house on public.house_plan_history (house_id, created_at);
create index if not exists house_plan_history_when on public.house_plan_history (created_at);
alter table public.house_plan_history enable row level security;
revoke all on public.house_plan_history from public, anon, authenticated;

create or replace function public.log_house_plan_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare ro int; rn int; v_reason text;
begin
  if tg_op = 'INSERT' then
    insert into public.house_plan_history (house_id, from_plan, to_plan, reason) values (new.id, null, new.plan::text, 'inicio');
    return new;
  end if;
  if new.plan is not distinct from old.plan then return new; end if;
  ro := case old.plan::text when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 else 1 end;
  rn := case new.plan::text when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 else 1 end;
  v_reason := case
    when auth.uid() is not null and public.is_admin() then 'admin'
    when old.plan_revert_at is not null and new.plan_revert_at is null and new.plan is not distinct from old.plan_revert_to then 'admin'  -- fim de degustação dada pela administração
    when new.plan::text = 'gratis' then 'cancelou'
    when rn > ro then 'subiu'
    else 'rebaixou' end;
  insert into public.house_plan_history (house_id, from_plan, to_plan, reason) values (new.id, old.plan::text, new.plan::text, v_reason);
  return new;
end $$;
revoke all on function public.log_house_plan_change() from public, anon, authenticated;

drop trigger if exists trg_houses_plan_history on public.houses;
create trigger trg_houses_plan_history after insert or update of plan on public.houses for each row execute function public.log_house_plan_change();

-- casas que já existiam: uma linha "inicio" no plano de hoje, na data de criação (só se ainda não houver histórico)
insert into public.house_plan_history (house_id, from_plan, to_plan, reason, created_at)
select h.id, null, h.plan::text, 'inicio', h.created_at from public.houses h
 where not exists (select 1 from public.house_plan_history x where x.house_id = h.id);

-- ============ b) dias de atividade ============
create table if not exists public.user_activity_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create index if not exists user_activity_days_day on public.user_activity_days (day);
alter table public.user_activity_days enable row level security;
revoke all on public.user_activity_days from public, anon, authenticated;

create or replace function public.touch_presence()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set last_seen_at = now() where id = auth.uid();
  insert into public.user_activity_days (user_id, day)
  select auth.uid(), (now() at time zone 'America/Sao_Paulo')::date
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null)
  on conflict do nothing;
end $$;
revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- o último acesso que já existe vira o primeiro dia registrado
insert into public.user_activity_days (user_id, day)
select p.id, (p.last_seen_at at time zone 'America/Sao_Paulo')::date from public.profiles p where p.last_seen_at is not null and p.deleted_at is null
on conflict do nothing;

-- ============ c) exclusão e "baixar meus dados" ============
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
  delete from public.user_activity_days where user_id = p_user;
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
    'chamados', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.kind, 'titulo', c.title, 'descricao', c.description, 'status', c.status, 'em', c.created_at) order by c.created_at) from public.support_cases c where c.opened_by = me), '[]'::jsonb),
    'dias_de_acesso', coalesce((select jsonb_agg(d.day order by d.day) from public.user_activity_days d where d.user_id = me), '[]'::jsonb));
end $$;

revoke all on function public.export_my_data() from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;

-- ============ d) indicadores da administração, agora exatos ============
create or replace function public.admin_indicators(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  a timestamptz; b timestamptz; i int; r jsonb := '[]'::jsonb; snap jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  for i in 1..2 loop
    b := now() - make_interval(days => v_days * (i - 1));
    a := b - make_interval(days => v_days);
    r := r || jsonb_build_array(jsonb_build_object(
      -- crescimento
      'novas_contas', (select count(*) from public.profiles p where p.created_at >= a and p.created_at < b),
      'novas_casas', (select count(*) from public.houses h where h.created_at >= a and h.created_at < b),
      -- conversão: casa criada no período que já esteve em plano pago (começou nele ou subiu; troca feita pela administração não conta)
      'novas_casas_pagantes', (select count(*) from public.houses h where h.created_at >= a and h.created_at < b
          and exists (select 1 from public.house_plan_history ph where ph.house_id = h.id and ph.to_plan <> 'gratis' and ph.reason in ('inicio', 'subiu'))),
      'cancelamentos', (select count(*) from public.house_plan_history ph where ph.reason = 'cancelou' and ph.created_at >= a and ph.created_at < b),
      'ativos_no_periodo', (select count(distinct d.user_id) from public.user_activity_days d where d.day > (a at time zone 'America/Sao_Paulo')::date and d.day <= (b at time zone 'America/Sao_Paulo')::date),
      'casas_ativas_no_periodo', (select count(distinct h.id) from public.user_activity_days d join public.houses h on h.owner_id = d.user_id where d.day > (a at time zone 'America/Sao_Paulo')::date and d.day <= (b at time zone 'America/Sao_Paulo')::date),
      -- negócio das casas (pagamentos confirmados)
      'volume_cents', (select coalesce(sum(p.gross_cents), 0) from public.payments p where p.status = 'confirmado' and p.created_at >= a and p.created_at < b),
      'comissao_cents', (select coalesce(sum(p.fee_cents), 0) from public.payments p where p.status = 'confirmado' and p.created_at >= a and p.created_at < b),
      'casas_que_venderam', (select count(distinct x.house_id) from (
            select o.house_id from public.payments p join public.service_orders o on o.id = p.order_id where p.status = 'confirmado' and p.created_at >= a and p.created_at < b
            union select e.house_id from public.payments p join public.reservations rs on rs.id = p.reservation_id join public.events e on e.id = rs.event_id where p.status = 'confirmado' and p.created_at >= a and p.created_at < b
            union select md.house_id from public.payments p join public.member_dues md on md.id = p.member_due_id where p.status = 'confirmado' and p.created_at >= a and p.created_at < b) x),
      -- receita da plataforma (cobranças pagas à plataforma)
      'receita_assinatura_cents', (select coalesce(sum(c.paid_amount_cents), 0) from public.platform_charges c where c.status = 'paga' and c.kind in ('plan', 'extra_seat') and c.paid_at >= a and c.paid_at < b),
      'receita_divulgacao_cents', (select coalesce(sum(c.paid_amount_cents), 0) from public.platform_charges c where c.status = 'paga' and c.kind in ('highlight', 'boost') and c.paid_at >= a and c.paid_at < b),
      'receita_creditos_cents', (select coalesce(sum(c.paid_amount_cents), 0) from public.platform_charges c where c.status = 'paga' and c.kind = 'credit_pack' and c.paid_at >= a and c.paid_at < b),
      'cobrancas_vencidas', (select count(*) from public.platform_charges c where c.status = 'vencida' and c.due_date >= a::date and c.due_date < b::date),
      'cobrancas_canceladas', (select count(*) from public.platform_charges c where c.status = 'cancelada' and c.updated_at >= a and c.updated_at < b),
      -- reembolsos
      'reembolsos_pedidos', (select count(*) from public.refund_requests q where q.created_at >= a and q.created_at < b),
      'reembolsos_feitos', (select count(*) from public.refund_requests q where q.status = 'reembolsado' and q.created_at >= a and q.created_at < b),
      'pagamentos_estornados', (select count(*) from public.payments p where p.status in ('estornado', 'estornado_parcial') and p.created_at >= a and p.created_at < b),
      'reembolsos_plano_cents', (select coalesce(sum(f.amount_cents), 0) from public.platform_plan_refunds f where f.status = 'concluido' and f.created_at >= a and f.created_at < b),
      -- disputas e incidentes
      'pagamentos_contestados', (select count(*) from public.payments p where p.status = 'contestado' and p.created_at >= a and p.created_at < b),
      'casos_disputa', (select count(*) from public.support_cases s where s.kind = 'disputa' and s.created_at >= a and s.created_at < b),
      'incidentes', (select count(*) from public.support_cases s where s.kind in ('risco_vida', 'golpe_fraude', 'abuso') and s.created_at >= a and s.created_at < b),
      -- qualidade do atendimento (casos de suporte abertos no período)
      'casos_abertos', (select count(*) from public.support_cases s where s.created_at >= a and s.created_at < b),
      'casos_resolvidos', (select count(*) from public.support_cases s where s.resolved_at >= a and s.resolved_at < b),
      'casos_com_resposta', (select count(*) from public.support_cases s where s.created_at >= a and s.created_at < b and s.first_response_at is not null),
      'casos_resposta_no_prazo', (select count(*) from public.support_cases s where s.created_at >= a and s.created_at < b and s.first_response_at is not null and s.first_response_at <= s.first_response_due),
      'casos_sem_resposta_no_prazo', (select count(*) from public.support_cases s where s.created_at >= a and s.created_at < b and s.first_response_at is null and s.first_response_due < now()),
      'primeira_resposta_mediana_h', (select round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_response_at - s.created_at)) / 3600))::numeric, 1)
          from public.support_cases s where s.created_at >= a and s.created_at < b and s.first_response_at is not null),
      -- custo de IA e uso de recursos
      'ia_respostas', (select count(*) from public.assistant_usage u where u.created_at >= a and u.created_at < b),
      'ia_tokens_entrada', (select coalesce(sum(u.prompt_tokens), 0) from public.assistant_usage u where u.created_at >= a and u.created_at < b),
      'ia_tokens_saida', (select coalesce(sum(u.completion_tokens), 0) from public.assistant_usage u where u.created_at >= a and u.created_at < b),
      'mensagens', (select count(*) from public.messages m where m.created_at >= a and m.created_at < b and not m.from_assistant),
      'pedidos_criados', (select count(*) from public.service_orders o where o.created_at >= a and o.created_at < b),
      'reservas_criadas', (select count(*) from public.reservations x where x.created_at >= a and x.created_at < b)
    ));
  end loop;

  -- números do momento (sem comparação)
  snap := jsonb_build_object(
    'usuarios_total', (select count(*) from public.profiles),
    'casas_total', (select count(*) from public.houses),
    'casas_por_plano', (select coalesce(jsonb_object_agg(t.plan, t.n), '{}'::jsonb) from (select h.plan::text plan, count(*) n from public.houses h group by h.plan) t),
    'ativos_7d', (select count(*) from public.profiles p where p.last_seen_at >= now() - interval '7 days'),
    'ativos_30d', (select count(*) from public.profiles p where p.last_seen_at >= now() - interval '30 days'),
    'casas_ativas_30d', (select count(*) from public.houses h join public.profiles p on p.id = h.owner_id where p.last_seen_at >= now() - interval '30 days'),
    -- retenção: das casas em plano pago há 30 dias (pelo histórico de plano), quantas continuam em plano pago hoje
    'assinantes_base', (select count(*) from public.houses h where coalesce((select ph.to_plan from public.house_plan_history ph where ph.house_id = h.id and ph.created_at <= now() - interval '30 days' order by ph.created_at desc, ph.id desc limit 1), 'gratis') <> 'gratis'),
    'assinantes_retidos', (select count(*) from public.houses h where h.plan::text <> 'gratis' and coalesce((select ph.to_plan from public.house_plan_history ph where ph.house_id = h.id and ph.created_at <= now() - interval '30 days' order by ph.created_at desc, ph.id desc limit 1), 'gratis') <> 'gratis'),
    'atividade_desde', (select min(d.day) from public.user_activity_days d),
    'casos_em_aberto', (select count(*) from public.support_cases s where s.status not in ('resolvido', 'recusado'))
  );

  return jsonb_build_object('generated_at', now(), 'days', v_days,
    'since', now() - make_interval(days => v_days), 'previous_since', now() - make_interval(days => v_days * 2),
    'metrics', (select jsonb_object_agg(e.key, jsonb_build_object('current', e.value, 'previous', (r -> 1) -> e.key)) from jsonb_each(r -> 0) e),
    'snapshot', snap,
    'scope', 'Plataforma inteira, só administração. Lê as tabelas originais na hora; não guarda cópia.');
end $$;

revoke all on function public.admin_indicators(integer) from public, anon, authenticated;
grant execute on function public.admin_indicators(integer) to authenticated;

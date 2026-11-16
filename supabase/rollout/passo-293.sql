-- PASSO 293: 0134_historico_de_plano_e_dias_de_atividade — parte 4 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

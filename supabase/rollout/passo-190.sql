-- PASSO 190: 0105_exclusao_conta_pendencias_financeiras — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0105 — Exclusão de conta não passa por cima de pendência financeira (orientação do advogado, 13/11/2026; LGPD permite reter dados e bloquear o encerramento
-- enquanto houver obrigação financeira em aberto). Regras:
--  (1) a exclusão é recusada, com o motivo na tela, se a casa da pessoa tem fatura da plataforma vencida, assinatura ativa, pagamento em processamento
--      ou reembolso do plano em andamento; as demais travas (chamados, serviços, reservas, reembolsos) continuam como antes;
--  (2) o pedido de exclusão só nasce sem pendência; se uma fatura vencer antes dos 7 dias, a rotina recusa o pedido e avisa (já era assim para as outras travas);
--  (3) a trava não cria cobrança nova: ela só lê. Cobrança automática só acontece com cartão salvo e autorizado;
--  (4) ao anonimizar, o cartão guardado é apagado do banco e entra numa fila para o provedor de pagamento (cartão desvinculado, cliente apagado).
--      Se o provedor falhar, a tentativa fica na fila e repete. O registro de autorização da cobrança automática é mantido (prova de consentimento, retenção de 5 anos).

-- ============ 1) travas financeiras ============
create or replace function public.account_deletion_money_blockers(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b jsonb := '[]'::jsonb; h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; v_debt bigint;
begin
  select id into h from public.houses where owner_id = p_user limit 1;
  if h is null then return b; end if;
  v_debt := public.platform_house_overdue_cents(h, d);
  if v_debt > 0 then
    b := b || to_jsonb('Há fatura vencida da plataforma de ' || public.billing_money_br(v_debt) || '. Pague a fatura para poder excluir a conta.'::text);
  end if;
  if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false)
     and exists (select 1 from public.house_billing_plan p where p.house_id = h and p.active)
     and not exists (select 1 from public.house_billing_state s where s.house_id = h and s.cancelled_at is not null) then
    b := b || '["Sua casa tem assinatura ativa. Cancele a assinatura antes de excluir a conta."]'::jsonb;
  end if;
  if exists (select 1 from public.platform_charges c where c.house_id = h and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
    b := b || '["Há um pagamento da plataforma em processamento. Aguarde a confirmação."]'::jsonb;
  end if;
  if exists (select 1 from public.platform_plan_refunds r where r.house_id = h and r.status = 'pendente') then
    b := b || '["Há um reembolso do plano em andamento."]'::jsonb;
  end if;
  return b;
end $$;

-- mesma função de 0079, agora somando as travas financeiras
create or replace function public.account_deletion_blockers(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b jsonb := '[]'::jsonb;
begin
  if exists (select 1 from public.admins where user_id = p_user) then b := b || '["Conta de administrador: peça a remoção do acesso de administrador primeiro."]'::jsonb; end if;
  if exists (select 1 from public.support_cases c where (c.opened_by = p_user or c.subject_user = p_user) and c.status not in ('resolvido','recusado') and c.kind not in ('exclusao_conta','exclusao_dados','lgpd_dados','duvida','sugestao','tecnico','conta_acesso')) then
    b := b || '["Há um chamado em análise envolvendo você. A exclusão só pode ocorrer depois da decisão."]'::jsonb;
  end if;
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
  b := b || public.account_deletion_money_blockers(p_user);
  return b;
end $$;

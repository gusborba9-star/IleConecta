-- PASSO 175: 0101_cancelamento_e_tela_unica — parte 1 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0101 — Cancelamento da assinatura pela casa e tela única de conta bloqueada/inativa.
-- Decisões do proprietário (13/11/2026): a casa cancela quando quiser, escolhendo "usar até o vencimento" (no dia a casa fica inativa e não é
-- cobrada de novo; até lá pode desfazer) ou "cancelar agora" (inativa na hora, sem devolução; dentro dos 7 dias do primeiro pagamento vale o reembolso).
-- Cancelar não apaga dívida: com fatura em atraso o cancelamento é recusado. Bloqueio total e conta inativa levam a uma tela única (no app); aqui
-- ficam o estado da conta e a trava no servidor: casa em bloqueio total não grava mais nada de casa (posts, serviços, campanhas, equipe etc.).

-- ============ 1) cancelamento agendado ============
alter table public.house_billing_state add column if not exists cancel_at date;

alter table public.house_billing_state add column if not exists cancel_requested_at timestamptz;

alter table public.house_billing_state add column if not exists cancel_charges uuid[] not null default '{}';

-- ============ 2) funções internas ============
-- próxima renovação da casa: a fatura de plano ainda em aberto que vem pela frente, ou o próximo dia de cobrança depois de hoje
create or replace function public.platform_house_next_renewal(p_house uuid, p_today date)
returns date language plpgsql stable security definer set search_path = public as $$
declare v date; pl public.house_billing_plan; c date;
begin
select min(period_start) into v from public.platform_charges where house_id = p_house and kind = 'plan' and status = 'aberta' and period_start >= p_today and idempotency_key not like 'reativacao:%';
if v is not null then return v; end if;
select * into pl from public.house_billing_plan where house_id = p_house and active;
if not found then return null; end if;
c := date_trunc('month', p_today)::date + (pl.billing_day - 1);
if c <= p_today then c := (date_trunc('month', p_today) + interval '1 month')::date + (pl.billing_day - 1); end if;
return c;
end $$;

-- por que a casa não pode cancelar agora (null = pode)
create or replace function public.platform_cancel_block_reason(p_house uuid, p_today date)
returns text language plpgsql stable security definer set search_path = public as $$
declare st public.house_billing_state;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return 'A cobrança da plataforma ainda não está ativa.'; end if;
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return 'A casa não tem assinatura ativa.'; end if;
select * into st from public.house_billing_state where house_id = p_house;
if found and st.cancelled_at is not null then return 'A assinatura já está cancelada.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and (c.status = 'vencida' or (c.status = 'aberta' and c.due_date < p_today))) then
return 'Há uma fatura em atraso. Regularize o pagamento antes de cancelar ou fale com a administração.';
end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
return 'Há um pagamento em processamento. Aguarde a confirmação para cancelar.';
end if;
if exists (select 1 from public.platform_plan_refunds r where r.house_id = p_house and r.status = 'pendente') then
return 'Há um reembolso do plano em andamento.';
end if;
return null;
end $$;

-- encerra a assinatura (mesmo estado final do reembolso do plano): cobrança mensal e cartão automático param, faturas ainda não vencidas são canceladas e a casa fica inativa
create or replace function public.platform_house_cancel_apply(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then return false; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then return false; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind in ('plan', 'extra_seat') and status = 'aberta';
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = p_house and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (p_house, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, cancel_at = null, cancel_charges = '{}', updated_at = now();
perform public.platform_house_billing_recompute(p_house, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_cancelada', 'processado', p_house::text);
select owner_id into v_owner from public.houses where id = p_house;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Assinatura cancelada. A casa está inativa e nenhuma nova cobrança será feita. Seus dados ficam guardados. Para voltar, entre na sua conta e escolha um plano.', '/planos');
end if;
return true;
end $$;

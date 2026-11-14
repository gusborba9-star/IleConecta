-- PASSO 182: 0103_cancelar_com_divida_e_aceite_cartoes — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0103 — Cancelar com fatura vencida, reativar só quitando e aceite obrigatório da cobrança automática.
-- Decisões do proprietário com o parecer do advogado (13/11/2026):
--  (1) a casa pode cancelar mesmo com fatura vencida: as cobranças futuras param, mas a fatura vencida NÃO é cancelada (continua aberta e exigível);
--  (2) a conta inativa só reativa depois de quitar a fatura vencida (cobrança imediata do plano, sem período grátis);
--  (3) cobrança automática só com aceite registrado: cartões salvos antes da regra (sem registro) têm a cobrança automática desligada e a casa é avisada.
-- Segue valendo: cancelamento recusado com pagamento em processamento ou reembolso do plano em andamento.

-- ============ 1) quanto a casa deve (faturas de plano/vagas vencidas, fora a de reativação) ============
create or replace function public.platform_house_overdue_cents(p_house uuid, p_today date)
returns bigint language sql stable security definer set search_path = public as $$
select coalesce(sum(c.amount_cents), 0)::bigint from public.platform_charges c
where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.idempotency_key not like 'reativacao:%'
and (c.status = 'vencida' or (c.status = 'aberta' and c.due_date < p_today));
$$;

create or replace function public.billing_money_br(p_cents bigint) returns text
language sql immutable set search_path = public as $$
select 'R$ ' || replace(to_char(coalesce(p_cents, 0) / 100.0, 'FM9999990.00'), '.', ',');
$$;

-- ============ 2) cancelar não depende mais de fatura em dia ============
create or replace function public.platform_cancel_block_reason(p_house uuid, p_today date)
returns text language plpgsql stable security definer set search_path = public as $$
declare st public.house_billing_state;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return 'A cobrança da plataforma ainda não está ativa.'; end if;
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return 'A casa não tem assinatura ativa.'; end if;
select * into st from public.house_billing_state where house_id = p_house;
if found and st.cancelled_at is not null then return 'A assinatura já está cancelada.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
return 'Há um pagamento em processamento. Aguarde a confirmação para cancelar.';
end if;
if exists (select 1 from public.platform_plan_refunds r where r.house_id = p_house and r.status = 'pendente') then
return 'Há um reembolso do plano em andamento.';
end if;
return null;
end $$;

-- encerra a assinatura: faturas ainda NÃO vencidas são canceladas; as vencidas continuam abertas (a dívida não some com o cancelamento)
create or replace function public.platform_house_cancel_apply(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_debt bigint; v_text text;
begin
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then return false; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then return false; end if;
v_debt := public.platform_house_overdue_cents(p_house, v_day);
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind in ('plan', 'extra_seat') and status = 'aberta' and due_date >= v_day;
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = p_house and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (p_house, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, cancel_at = null, cancel_charges = '{}', updated_at = now();
perform public.platform_house_billing_recompute(p_house, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_cancelada', 'processado', p_house::text);
select owner_id into v_owner from public.houses where id = p_house;
if v_owner is not null then
v_text := 'Assinatura cancelada. A casa está inativa e nenhuma nova cobrança será feita. Seus dados ficam guardados.';
if v_debt > 0 then
v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto e precisa ser paga para reativar a conta.';
else
v_text := v_text || ' Para voltar, entre na sua conta e escolha um plano.';
end if;
insert into public.notifications (user_id, text, href) values (v_owner, v_text, '/planos');
end if;
return true;
end $$;

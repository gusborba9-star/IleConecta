-- PASSO 200: 0108_contratacao_de_plano_no_app — parte 1 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0108 — Contratação de plano dentro do app (decisões do proprietário, 14/11/2026).
-- Primeira assinatura (casa no Base ou sem assinatura): paga a mensalidade cheia, o plano muda ao confirmar e o vencimento mensal passa a ser o dia do pagamento.
-- Upgrade: sobe na hora e paga só a diferença proporcional aos dias que faltam no ciclo; o vencimento não muda. Indisponível nos 7 dias do primeiro pagamento (preserva o reembolso)
-- e enquanto a fatura da próxima renovação já estiver gerada (ela foi calculada com o plano atual).
-- Downgrade (e volta ao Base): vale na próxima renovação, sem devolução; a fatura dessa renovação já sai com o valor do plano novo.
-- Faturas de assinatura e de upgrade são pedidas na hora pela própria casa: sem lembretes, nunca puxadas pelo cartão automático, nunca viram atraso
-- (se não forem pagas, são canceladas depois de 2 dias, como as compras avulsas).

-- ============ 1) troca de plano agendada (só descida) ============
alter table public.house_billing_plan add column if not exists pending_plan text;

alter table public.house_billing_plan add column if not exists pending_plan_on date;

alter table public.house_billing_plan drop constraint if exists house_billing_plan_pending_ck;

alter table public.house_billing_plan add constraint house_billing_plan_pending_ck check ((pending_plan is null) = (pending_plan_on is null) and (pending_plan is null or pending_plan in ('base', 'intermediario')));

create or replace function public.platform_plan_rank(p text) returns int
language sql immutable set search_path = public as $$
select case p when 'base' then 0 when 'intermediario' then 1 when 'maximo' then 2 end;
$$;

-- ============ 2) por que a casa não pode trocar de plano agora (null = pode) ============
create or replace function public.platform_plan_change_block_reason(p_house uuid, p_today date)
returns text language plpgsql stable security definer set search_path = public as $$
declare st public.house_billing_state;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return 'A cobrança da plataforma ainda não está ativa.'; end if;
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return 'A casa não tem assinatura ativa.'; end if;
select * into st from public.house_billing_state where house_id = p_house;
if found and (st.cancelled_at is not null or st.cancel_at is not null) then return 'A assinatura está cancelada ou com cancelamento agendado.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and (c.status = 'vencida' or (c.status = 'aberta' and c.due_date < p_today))) then
return 'Há uma fatura em atraso. Regularize o pagamento antes de trocar de plano.';
end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
return 'Há um pagamento em processamento. Aguarde a confirmação para trocar de plano.';
end if;
if exists (select 1 from public.platform_plan_refunds r where r.house_id = p_house and r.status = 'pendente') then
return 'Há um reembolso do plano em andamento.';
end if;
return null;
end $$;

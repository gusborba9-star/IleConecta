-- PASSO 213: 0111_plano_gratis — parte 4 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- o aviso do cancelamento agendado passa a dizer que a casa volta ao Grátis
create or replace function public.my_cancel_subscription(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text; v_next date; v_ids uuid[]; v_text text; v_debt bigint;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
if p_mode is null or p_mode not in ('agora', 'vencimento') then raise exception 'Escolha como quer cancelar.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa pode cancelar a assinatura.'; end if;
perform 1 from public.house_billing_plan where house_id = h and active for update;
select * into st from public.house_billing_state where house_id = h for update;
if found and st.cancel_at is not null and st.cancelled_at is null then raise exception 'O cancelamento já está agendado para %.', to_char(st.cancel_at, 'DD/MM/YYYY'); end if;
v_reason := public.platform_cancel_block_reason(h, d);
if v_reason is not null then raise exception '%', v_reason; end if;
v_debt := public.platform_house_overdue_cents(h, d);
v_next := public.platform_house_next_renewal(h, d);
if p_mode = 'agora' or v_next is null or v_next <= d then
perform public.platform_house_cancel_apply(h);
return jsonb_build_object('mode', 'agora', 'cancel_at', null, 'debt_cents', v_debt);
end if;
with u as (update public.platform_charges set status = 'cancelada' where house_id = h and kind in ('plan', 'extra_seat') and status = 'aberta' and due_date >= d returning id)
select coalesce(array_agg(id), '{}') into v_ids from u;
insert into public.house_billing_state (house_id, cancel_at, cancel_requested_at, cancel_charges, updated_at) values (h, v_next, now(), v_ids, now())
on conflict (house_id) do update set cancel_at = excluded.cancel_at, cancel_requested_at = excluded.cancel_requested_at, cancel_charges = excluded.cancel_charges, updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'cancelamento_agendado', 'processado', h::text || ':' || v_next);
v_text := 'Cancelamento agendado: você usa a plataforma até ' || to_char(v_next, 'DD/MM/YYYY') || '. Nesse dia a casa volta ao plano Grátis e nenhuma nova cobrança é feita. Até lá, você pode desfazer em Planos.';
if v_debt > 0 then v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto.'; end if;
insert into public.notifications (user_id, text, href) values (me, v_text, '/planos');
return jsonb_build_object('mode', 'vencimento', 'cancel_at', v_next, 'debt_cents', v_debt);
end $$;

-- ============ 4) troca de plano: contratar o Essencial; descer para o Essencial ou para o Grátis na renovação ============
alter table public.house_billing_plan drop constraint if exists house_billing_plan_pending_ck;

alter table public.house_billing_plan add constraint house_billing_plan_pending_ck check ((pending_plan is null) = (pending_plan_on is null) and (pending_plan is null or pending_plan in ('gratis', 'base', 'intermediario')));

create or replace function public.platform_subscribe_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_amt bigint; v_open uuid; v_n int; v_id uuid;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then raise exception 'A cobrança da plataforma ainda não está ativa.'; end if;
perform 1 from public.houses where id = p_house for update;
if not found then raise exception 'Casa inexistente.'; end if;
if p_plan is null or p_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Escolha um plano com mensalidade.'; end if;
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then raise exception 'A assinatura está cancelada. Use a reativação da casa.'; end if;
if exists (select 1 from public.house_billing_plan where house_id = p_house and active) then raise exception 'A casa já tem assinatura ativa. Use a troca de plano.'; end if;
v_amt := public.platform_plan_monthly_cents(p_plan, v_day);
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade na tabela. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida') and amount_cents = v_amt and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
if exists (select 1 from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status = 'em_processamento') then raise exception 'Há um pagamento em processamento. Aguarde a confirmação.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, v_amt, v_day, null, 'Assinatura do plano', 'assinatura:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

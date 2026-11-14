-- PASSO 183: 0103_cancelar_com_divida_e_aceite_cartoes — parte 2 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.my_cancel_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'can_cancel', false); end if;
select * into st from public.house_billing_state where house_id = h;
v_reason := public.platform_cancel_block_reason(h, d);
return jsonb_build_object('has_house', true,
'scheduled', st.cancel_at is not null and st.cancelled_at is null, 'cancel_at', case when st.cancelled_at is null then st.cancel_at end,
'can_cancel', v_reason is null and not coalesce(st.cancel_at is not null, false), 'reason', case when st.cancel_at is not null and st.cancelled_at is null then null else v_reason end,
'next_renewal', public.platform_house_next_renewal(h, d),
'debt_cents', public.platform_house_overdue_cents(h, d));
end $$;

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
v_text := 'Cancelamento agendado: você usa a plataforma até ' || to_char(v_next, 'DD/MM/YYYY') || '. Nesse dia a casa fica inativa e nenhuma nova cobrança é feita. Até lá, você pode desfazer em Planos.';
if v_debt > 0 then v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto.'; end if;
insert into public.notifications (user_id, text, href) values (me, v_text, '/planos');
return jsonb_build_object('mode', 'vencimento', 'cancel_at', v_next, 'debt_cents', v_debt);
end $$;

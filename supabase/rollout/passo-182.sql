-- PASSO 182: 0101_cancelamento_e_tela_unica — parte 8 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.my_cancel_undo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; c public.platform_charges; n int := 0;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa pode desfazer o cancelamento.'; end if;
select * into st from public.house_billing_state where house_id = h for update;
if not found or st.cancel_at is null or st.cancelled_at is not null then raise exception 'Não há cancelamento agendado.'; end if;
if st.cancel_at <= d then raise exception 'O cancelamento vale a partir de hoje e não pode mais ser desfeito.'; end if;
-- a fatura do próximo ciclo foi cancelada ao agendar e o sistema não reabre fatura cancelada: reemite uma cópia (mesmo valor e vencimento)
for c in select * from public.platform_charges where id = any (st.cancel_charges) and status = 'cancelada' order by created_at loop
perform public.platform_charge_issue(c.house_id, c.kind, c.item_key, c.amount_cents, c.due_date, c.period_start, c.description, left(c.idempotency_key, 100) || ':' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
n := n + 1;
end loop;
update public.house_billing_state set cancel_at = null, cancel_requested_at = null, cancel_charges = '{}', updated_at = now() where house_id = h;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'cancelamento_desfeito', 'processado', h::text);
insert into public.notifications (user_id, text, href) values (me, 'Cancelamento desfeito: a sua assinatura continua normalmente.', '/planos');
return jsonb_build_object('reissued', n);
end $$;

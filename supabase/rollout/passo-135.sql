-- PASSO 135: 0095_reembolso_creditos_7_dias — parte 7 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) concluído no provedor: livro-razão, fatura e aviso (repetir não duplica) ============
create or replace function public.platform_credit_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.platform_credit_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.platform_credit_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.platform_credit_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if r.amount_cents >= c.paid_amount_cents and c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: devolvemos o valor de ' || r.credits || ' respostas não usadas do pacote. O dinheiro volta pelo mesmo meio de pagamento em alguns dias, conforme o banco.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

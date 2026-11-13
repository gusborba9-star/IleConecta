-- PASSO 134: 0095_reembolso_creditos_7_dias — parte 6 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) começar o reembolso: valida, retira o saldo e registra (repetir não duplica) ============
create or replace function public.platform_credit_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; pk public.ai_credit_packs; r public.platform_credit_refunds; v_amount bigint; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'credit_pack' or c.status <> 'paga' then raise exception 'Esta compra não pode ser reembolsada.'; end if;
select * into r from public.platform_credit_refunds where charge_id = p_charge and status in ('pendente', 'concluido');
if found then
if r.status = 'concluido' then raise exception 'Esta compra já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'credits', r.credits, 'resume', true);
end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
select * into pk from public.ai_credit_packs where charge_id = p_charge for update;
if not found then raise exception 'Pacote não encontrado.'; end if;
if pk.remaining <= 0 then raise exception 'Todos os créditos deste pacote já foram usados.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
v_amount := public.platform_credit_refund_cents(c.paid_amount_cents, pk.remaining, pk.size);
if v_amount <= 0 then raise exception 'Nada a reembolsar.'; end if;
update public.ai_credit_packs set remaining = 0 where id = pk.id;
insert into public.platform_credit_refunds (charge_id, house_id, pack_id, credits, amount_cents, provider, requested_by)
values (c.id, c.house_id, pk.id, pk.remaining, v_amount, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', v_amount, 'credits', pk.remaining, 'resume', false);
end $$;

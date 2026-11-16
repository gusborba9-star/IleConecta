-- PASSO 276: 0128_arrependimento_vaga_extra — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) começar o reembolso: valida e registra (repetir não duplica)
create or replace function public.platform_seat_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; r public.platform_seat_refunds; h public.houses; s public.house_extra_seats; v_use int; v_incl int; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'extra_seat' or c.idempotency_key not like 'upgrade:seat:%' or c.status <> 'paga' then raise exception 'Esta cobrança não pode ser reembolsada.'; end if;
select * into r from public.platform_seat_refunds where charge_id = p_charge and status in ('pendente', 'concluido');
if found then
if r.status = 'concluido' then raise exception 'Esta vaga já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
if c.paid_at is null or p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
if c.paid_amount_cents is null or c.paid_amount_cents <= 0 or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
select * into h from public.houses where id = p_house;
select * into s from public.house_extra_seats where house_id = p_house for update;
v_incl := public.plan_cap_int(h.plan::text, 'included_seats');
select count(*) into v_use from public.house_staff where house_id = p_house;
if coalesce(s.seats, 0) > 0 and v_use > v_incl + (s.seats - 1) then
raise exception 'Há mais pessoas na equipe do que vagas. Remova % pessoa(s) da equipe antes de pedir o reembolso.', v_use - (v_incl + (s.seats - 1));
end if;
if exists (select 1 from public.platform_charges m where m.house_id = p_house and m.kind = 'extra_seat' and m.idempotency_key like 'extra_seat:%' and m.created_at > c.paid_at and m.status in ('em_processamento', 'paga')) then
raise exception 'A fatura de vagas da próxima renovação já está paga ou em pagamento. Fale com o suporte para o reembolso desta vaga.';
end if;
insert into public.platform_seat_refunds (charge_id, house_id, amount_cents, provider, requested_by) values (c.id, c.house_id, c.paid_amount_cents, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', c.paid_amount_cents, 'resume', false);
end $$;

-- ============ 4) concluído no provedor: razão, fatura, vaga retirada, fatura mensal refeita e aviso (repetir não duplica)
create or replace function public.platform_seat_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.platform_seat_refunds; c public.platform_charges; s public.house_extra_seats; h public.houses; m record;
v_owner uuid; v_money text; v_new int; v_clear boolean := false; v_old_cnt int; v_new_cnt int; v_unit bigint; v_n int; v_use int; v_incl int; v_prices jsonb; v_redone int := 0;
begin
select * into r from public.platform_seat_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
perform set_config('app.seat_refund', '1', true);
update public.platform_seat_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
select * into h from public.houses where id = r.house_id;
select * into s from public.house_extra_seats where house_id = r.house_id for update;
if found and s.seats > 0 then
v_new := s.seats - 1;
v_clear := s.release_on is not null and s.release_to >= v_new;
update public.house_extra_seats set seats = v_new, release_to = case when v_clear then null else release_to end, release_on = case when v_clear then null else release_on end where house_id = r.house_id;
v_prices := public.platform_billing_prices();
for m in select * from public.platform_charges where house_id = r.house_id and kind = 'extra_seat' and idempotency_key like 'extra_seat:%' and created_at > c.paid_at and status in ('aberta', 'vencida') order by period_start loop
begin
v_old_cnt := case when s.release_on is not null and m.period_start >= s.release_on then s.release_to else s.seats end;
v_new_cnt := case when s.release_on is not null and not v_clear and m.period_start >= s.release_on then s.release_to else v_new end;
if coalesce(v_old_cnt, 0) > 0 and v_new_cnt is distinct from v_old_cnt then
v_unit := case when m.amount_cents % v_old_cnt = 0 then m.amount_cents / v_old_cnt else (v_prices -> 'extra_seat' ->> h.plan::text)::bigint end;
update public.platform_charges set status = 'cancelada' where id = m.id;
if v_new_cnt > 0 then
select count(*) into v_n from public.platform_charges where house_id = r.house_id and idempotency_key like m.idempotency_key || ':r%';
perform public.platform_charge_issue(r.house_id, 'extra_seat', 'extra_seat', v_unit * v_new_cnt, m.due_date, m.period_start, 'Vagas adicionais de equipe (' || v_new_cnt || ')', m.idempotency_key || ':r' || (v_n + 1));
end if;
v_redone := v_redone + 1;
end if;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_refazer_fatura_vagas', m.id, 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
select count(*) into v_use from public.house_staff where house_id = r.house_id;
v_incl := public.plan_cap_int(h.plan::text, 'included_seats');
if v_use > v_incl + v_new then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_reembolsada_equipe_excedente', c.id, 'rejeitado', r.house_id::text);
end if;
end if;
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_reembolsada', c.id, 'processado', r.house_id::text);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: a vaga extra de equipe foi retirada. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.', '/equipe');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents, 'invoices_redone', v_redone);
end $$;

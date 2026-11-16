-- 0128 — Arrependimento de 7 dias na PRIMEIRA contratação da vaga extra de equipe (decisão do proprietário, 16/11/2026, conforme parecer jurídico).
-- Antes: o reembolso de 7 dias valia só para o plano. Agora também vale para a vaga extra, mas somente para o pagamento da contratação (fatura 'upgrade:seat:...').
-- As renovações mensais da vaga (fatura 'extra_seat:...') não têm arrependimento. Reembolso integral, a plataforma absorve a tarifa, uma vez por cobrança.
-- Ao concluir o estorno: a fatura vira 'estornada', a vaga é retirada na hora (uma vaga), a redução agendada é ajustada e uma fatura mensal de vagas
-- já emitida depois da compra e ainda não paga é refeita sem essa vaga. Estado de produção antes desta migration: nenhum reembolso de vaga existe.

-- ============ 1) reembolsos de vaga extra
create table if not exists public.platform_seat_refunds (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
amount_cents bigint not null check (amount_cents > 0),
status text not null default 'pendente' check (status in ('pendente', 'concluido', 'falhou')),
provider text,
provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
error text check (error is null or char_length(error) <= 300),
requested_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
done_at timestamptz
);

create unique index if not exists platform_seat_refunds_one_per_charge on public.platform_seat_refunds (charge_id) where status in ('pendente', 'concluido');

alter table public.platform_seat_refunds enable row level security;

drop policy if exists psr_read on public.platform_seat_refunds;

create policy psr_read on public.platform_seat_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.platform_seat_refunds_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reembolso não pode ser apagado.'; end if;
if old.status <> 'pendente' then raise exception 'Reembolso encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.charge_id is distinct from old.charge_id or new.house_id is distinct from old.house_id
or new.amount_cents is distinct from old.amount_cents or new.created_at is distinct from old.created_at then
raise exception 'Valor e fatura do reembolso não podem ser alterados.';
end if;
new.updated_at := now();
return new;
end $$;

drop trigger if exists trg_platform_seat_refunds_guard on public.platform_seat_refunds;

create trigger trg_platform_seat_refunds_guard before update or delete on public.platform_seat_refunds
for each row execute function public.platform_seat_refunds_guard();

-- ============ 2) estorno que a própria casa pediu não vira alerta de revisão; a trava da redução reconhece a fatura refeita
create or replace function public.platform_seat_refunded_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if coalesce(current_setting('app.seat_refund', true), '') = '1' then return new; end if;
if new.kind = 'extra_seat' and new.idempotency_key like 'upgrade:seat:%' and new.status = 'estornada' and old.status is distinct from 'estornada' then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_estornada_revisar', new.id, 'processado', new.house_id::text);
end if;
return new;
end $$;

create or replace function public.my_seat_release_schedule(p_keep int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; bp public.house_billing_plan; s public.house_extra_seats; c date; v_incl int; v_use int;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then raise exception 'Só a casa pode reduzir vagas.'; end if;
select * into bp from public.house_billing_plan where house_id = h.id and active for update;
if not found then raise exception 'A casa não tem assinatura ativa.'; end if;
select * into s from public.house_extra_seats where house_id = h.id for update;
if not found or s.seats <= 0 then raise exception 'A casa não tem vagas extras.'; end if;
if p_keep is null or p_keep < 0 or p_keep >= s.seats then raise exception 'Escolha uma quantidade menor que a atual.'; end if;
v_incl := public.plan_cap_int(h.plan::text, 'included_seats');
select count(*) into v_use from public.house_staff where house_id = h.id;
if v_use > v_incl + p_keep then raise exception 'Há mais pessoas na equipe do que vagas. Remova % pessoa(s) da equipe antes de reduzir.', v_use - (v_incl + p_keep); end if;
c := date_trunc('month', d)::date + (bp.billing_day - 1);
if c <= d then c := (date_trunc('month', d) + interval '1 month')::date + (bp.billing_day - 1); end if;
if exists (select 1 from public.platform_charges where house_id = h.id and kind = 'extra_seat' and idempotency_key like 'extra_seat:' || h.id || ':' || c || '%' and status <> 'cancelada') then c := (c + interval '1 month')::date; end if;
update public.house_extra_seats set release_to = p_keep, release_on = c where house_id = h.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_vagas_agendada', 'processado', h.id::text || ':' || p_keep || ':' || c);
return jsonb_build_object('keep', p_keep, 'effective_on', c);
end $$;

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

-- ============ 5) recusado pelo provedor, pendentes sem resposta e a tela da casa
create or replace function public.platform_seat_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.platform_seat_refunds; v_owner uuid;
begin
select * into r from public.platform_seat_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
update public.platform_seat_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso da vaga agora. A vaga continua com você. Tente de novo em instantes ou fale com o suporte.', '/equipe');
end if;
end $$;

create or replace function public.platform_seat_refunds_pending(p_older interval default interval '2 minutes')
returns table (refund_id uuid, provider text, ref text, amount_cents bigint)
language sql stable security definer set search_path = public as $$
select r.id, r.provider, c.paid_ref, r.amount_cents from public.platform_seat_refunds r join public.platform_charges c on c.id = r.charge_id
where r.status = 'pendente' and r.created_at < now() - p_older order by r.created_at limit 20;
$$;

create or replace function public.my_seat_refunds() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'window_days', 7, 'items', '[]'::jsonb, 'history', '[]'::jsonb); end if;
return jsonb_build_object('has_house', true, 'window_days', 7,
'items', coalesce((select jsonb_agg(jsonb_build_object('charge_id', c.id, 'amount_cents', c.paid_amount_cents, 'deadline', c.paid_at + interval '7 days') order by c.paid_at)
from public.platform_charges c where c.house_id = h and c.kind = 'extra_seat' and c.idempotency_key like 'upgrade:seat:%' and c.status = 'paga'
and c.paid_at + interval '7 days' >= now() and c.paid_ref is not null and c.paid_amount_cents > 0
and not exists (select 1 from public.platform_seat_refunds r where r.charge_id = c.id and r.status in ('pendente', 'concluido'))), '[]'::jsonb),
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_seat_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

-- ============ 6) permissões
revoke all on public.platform_seat_refunds from anon, authenticated;

grant select on public.platform_seat_refunds to authenticated;

revoke all on function public.platform_seat_refunds_guard(), public.platform_seat_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_seat_refund_done(uuid, text, timestamptz),
public.platform_seat_refund_fail(uuid, text), public.platform_seat_refunds_pending(interval), public.my_seat_refunds(), public.platform_seat_refunded_flag(), public.my_seat_release_schedule(int) from public, anon, authenticated;

grant execute on function public.platform_seat_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_seat_refund_done(uuid, text, timestamptz),
public.platform_seat_refund_fail(uuid, text), public.platform_seat_refunds_pending(interval) to service_role;

grant execute on function public.my_seat_refunds(), public.my_seat_release_schedule(int) to authenticated, service_role;

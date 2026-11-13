-- Fase 4: reembolso do primeiro pagamento do plano em até 7 dias (decisão do proprietário, 2026-11-13, conforme orientação jurídica: direito de arrependimento).
-- Regras: só o PRIMEIRO pagamento de plano da casa, dentro de 7 dias do pagamento, uma única vez por casa. Devolve o valor integral pago (a plataforma absorve a tarifa).
-- Ao concluir o estorno: a fatura vira 'estornada', a cobrança mensal para (a casa sai da matrícula), faturas abertas do plano e de vagas extras são canceladas,
-- a cobrança automática do cartão desliga e a casa fica INATIVA (bloqueio total já existente: fora da descoberta e do feed, painel só leitura; dados guardados).
-- A reativação é feita pelo suporte (admin_billing_reactivate + matrícula). Créditos de IA têm reembolso próprio e não entram aqui.
-- Estado de produção antes desta migration: nenhum reembolso de plano existe.

-- ============ 1) casa cancelada por reembolso: o estado de bloqueio passa a lembrar disso ============
alter table public.house_billing_state add column if not exists cancelled_at timestamptz;

create or replace function public.platform_house_billing_recompute(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); late boolean; fully boolean; proc boolean; susp boolean; tot boolean; was boolean; wast boolean; canc boolean; en boolean;
begin
if not exists (select 1 from public.houses where id = p_house) then return false; end if;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) < d) into late;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) + tdays < d) into fully;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status = 'em_processamento') into proc;
select coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = p_house), false) into canc;
en := coalesce((cfg ->> 'enabled')::boolean, false);
susp := en and ((late and not proc) or canc);
tot := en and ((late and not proc and fully) or canc);
select suspended, total into was, wast from public.house_billing_state where house_id = p_house;
if was is distinct from susp or wast is distinct from tot then
if susp or was is not null then
insert into public.house_billing_state (house_id, suspended, since, total, total_since, updated_at) values (p_house, susp, case when susp then p_now end, tot, case when tot then p_now end, now())
on conflict (house_id) do update set suspended = excluded.suspended, total = excluded.total,
since = case when excluded.suspended and house_billing_state.suspended then house_billing_state.since else excluded.since end,
total_since = case when excluded.total and house_billing_state.total then house_billing_state.total_since else excluded.total_since end,
updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason)
values ('sistema', gen_random_uuid()::text, case when tot and not coalesce(wast, false) then 'casa_bloqueio_total' when susp and not coalesce(was, false) then 'casa_suspensa' when susp then 'casa_volta_parcial' else 'casa_reativada' end, 'processado', p_house::text);
end if;
end if;
return susp;
end $$;

create or replace function public.house_billing_level(h uuid) returns text
language sql stable security definer set search_path = public as $$
select case when not coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) then 'ok'
when coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false) then 'total'
when coalesce((select s.total from public.house_billing_state s where s.house_id = h), false) then 'total'
when coalesce((select s.suspended from public.house_billing_state s where s.house_id = h), false) then 'parcial'
else 'ok' end;
$$;

-- ============ 2) reembolsos de plano ============
create table if not exists public.platform_plan_refunds (
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

create unique index if not exists platform_plan_refunds_one_per_house on public.platform_plan_refunds (house_id) where status in ('pendente', 'concluido');

create unique index if not exists platform_plan_refunds_one_per_charge on public.platform_plan_refunds (charge_id) where status in ('pendente', 'concluido');

alter table public.platform_plan_refunds enable row level security;

drop policy if exists ppr_read on public.platform_plan_refunds;

create policy ppr_read on public.platform_plan_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.platform_plan_refunds_guard() returns trigger
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

drop trigger if exists trg_platform_plan_refunds_guard on public.platform_plan_refunds;

create trigger trg_platform_plan_refunds_guard before update or delete on public.platform_plan_refunds
for each row execute function public.platform_plan_refunds_guard();

-- ============ 3) começar o reembolso: valida e registra (repetir não duplica) ============
create or replace function public.platform_plan_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; r public.platform_plan_refunds; v_first uuid; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'plan' or c.status <> 'paga' then raise exception 'Esta cobrança não pode ser reembolsada.'; end if;
select * into r from public.platform_plan_refunds where house_id = p_house and status in ('pendente', 'concluido');
if found then
if r.charge_id <> p_charge then raise exception 'O reembolso de 7 dias do plano já foi usado por esta casa.'; end if;
if r.status = 'concluido' then raise exception 'Esta cobrança já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
select id into v_first from public.platform_charges where house_id = p_house and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
if v_first is distinct from p_charge then raise exception 'O reembolso de 7 dias vale só para o primeiro pagamento do plano.'; end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
insert into public.platform_plan_refunds (charge_id, house_id, amount_cents, provider, requested_by) values (c.id, c.house_id, c.paid_amount_cents, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', c.paid_amount_cents, 'resume', false);
end $$;

-- ============ 4) concluído no provedor: livro-razão, fatura, cancelamento da assinatura e aviso (repetir não duplica) ============
create or replace function public.platform_plan_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.platform_plan_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.platform_plan_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.platform_plan_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = r.house_id and active;
update public.platform_charges set status = 'cancelada' where house_id = r.house_id and kind in ('plan', 'extra_seat') and status in ('aberta', 'vencida');
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = r.house_id and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (r.house_id, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, updated_at = now();
perform public.platform_house_billing_recompute(r.house_id, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'plano_reembolsado', 'processado', r.house_id::text);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: a assinatura do plano foi cancelada e as cobranças mensais pararam. O dinheiro volta pelo mesmo meio de pagamento em alguns dias. Seus dados ficam guardados. Para voltar a usar a plataforma, fale com o suporte.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

-- ============ 5) recusado de forma definitiva pelo provedor: nada muda na assinatura ============
create or replace function public.platform_plan_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.platform_plan_refunds; v_owner uuid;
begin
select * into r from public.platform_plan_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
update public.platform_plan_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso do plano agora. A sua assinatura continua ativa. Tente de novo em instantes ou fale com o suporte.', '/planos');
end if;
end $$;

-- reembolsos de plano que ficaram sem resposta do provedor (rede caiu): a rotina refaz com a mesma chave
create or replace function public.platform_plan_refunds_pending(p_older interval default interval '2 minutes')
returns table (refund_id uuid, provider text, ref text, amount_cents bigint)
language sql stable security definer set search_path = public as $$
select r.id, r.provider, c.paid_ref, r.amount_cents from public.platform_plan_refunds r join public.platform_charges c on c.id = r.charge_id
where r.status = 'pendente' and r.created_at < now() - p_older order by r.created_at limit 20;
$$;

-- ============ 6) tela da casa e reativação pelo suporte ============
create or replace function public.my_plan_refund() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; v_first public.platform_charges;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'eligible', false, 'window_days', 7, 'history', '[]'::jsonb); end if;
select * into v_first from public.platform_charges where house_id = h and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
return jsonb_build_object('has_house', true, 'window_days', 7,
'cancelled', coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false),
'eligible', v_first.id is not null and v_first.status = 'paga' and v_first.paid_at + interval '7 days' >= now() and v_first.paid_amount_cents is not null and v_first.paid_ref is not null
and not exists (select 1 from public.platform_plan_refunds r where r.house_id = h and r.status in ('pendente', 'concluido')),
'charge_id', case when v_first.status = 'paga' then v_first.id end, 'amount_cents', v_first.paid_amount_cents, 'deadline', v_first.paid_at + interval '7 days',
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_plan_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

create or replace function public.admin_billing_reactivate(p_house uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
update public.house_billing_state set cancelled_at = null, updated_at = now() where house_id = p_house and cancelled_at is not null;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_reactivate', null, jsonb_build_object('house', p_house, 'reason', left(btrim(p_reason), 300)));
perform public.platform_house_billing_recompute(p_house);
end $$;

-- ============ 7) permissões ============
revoke all on public.platform_plan_refunds from anon, authenticated;

grant select on public.platform_plan_refunds to authenticated;

revoke all on function public.platform_plan_refunds_guard(), public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_plan_refund_done(uuid, text, timestamptz),
public.platform_plan_refund_fail(uuid, text), public.platform_plan_refunds_pending(interval), public.my_plan_refund(), public.admin_billing_reactivate(uuid, text) from public, anon, authenticated;

grant execute on function public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_plan_refund_done(uuid, text, timestamptz),
public.platform_plan_refund_fail(uuid, text), public.platform_plan_refunds_pending(interval) to service_role;

grant execute on function public.my_plan_refund() to authenticated, service_role;

grant execute on function public.admin_billing_reactivate(uuid, text) to authenticated, service_role;

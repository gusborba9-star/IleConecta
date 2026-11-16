-- PASSO 275: 0128_arrependimento_vaga_extra — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

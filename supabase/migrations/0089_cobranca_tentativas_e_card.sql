-- Fase 4: Platform Billing — várias páginas de pagamento por fatura (o Pix expira), tarifa registrada depois do pagamento,
-- detecção de pagamento duplicado e a consulta que alimenta o card de aviso da casa. Nada aqui liga a cobrança: billing_config.enabled segue como está.
-- Estado de produção antes desta migration: nenhuma fatura existe (cobrança desligada), então não há dado a converter.

-- ============ 1) histórico de referências do provedor por fatura ============
alter table public.platform_charges add column if not exists paid_ref text;

create table if not exists public.platform_charge_refs (
id bigint generated always as identity primary key,
charge_id uuid not null references public.platform_charges(id) on delete restrict,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
ref text not null check (char_length(ref) between 1 and 200),
created_at timestamptz not null default now(),
unique (provider, ref)
);

create index if not exists platform_charge_refs_charge on public.platform_charge_refs (charge_id);

alter table public.platform_charge_refs enable row level security;

drop policy if exists pcr_read on public.platform_charge_refs;

create policy pcr_read on public.platform_charge_refs for select to authenticated using (public.is_admin());

drop trigger if exists trg_platform_refs_immutable on public.platform_charge_refs;

create trigger trg_platform_refs_immutable before update or delete on public.platform_charge_refs
for each row execute function public.platform_billing_immutable();

-- ============ 2) fatura: a referência só muda enquanto não há pagamento em andamento; pagamento e tarifa, depois de gravados, não mudam ============
create or replace function public.platform_charges_guard() returns trigger
language plpgsql set search_path = public as $$
declare ok boolean;
begin
if tg_op = 'DELETE' then raise exception 'Fatura não pode ser apagada; cancele-a.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.kind is distinct from old.kind or new.item_key is distinct from old.item_key
or new.amount_cents is distinct from old.amount_cents or new.due_date is distinct from old.due_date or new.period_start is distinct from old.period_start
or new.idempotency_key is distinct from old.idempotency_key or new.ref_id is distinct from old.ref_id or new.created_at is distinct from old.created_at then
raise exception 'Valor, vencimento, casa e produto da fatura não podem ser alterados.';
end if;
if old.provider_ref is not null and old.status not in ('aberta','vencida') and (new.provider_ref is distinct from old.provider_ref or new.provider is distinct from old.provider) then
raise exception 'A referência do provedor já foi definida e não pode mudar.';
end if;
if old.paid_ref is not null and new.paid_ref is distinct from old.paid_ref then raise exception 'A referência do pagamento não pode mudar.'; end if;
if old.paid_at is not null and (new.paid_at is distinct from old.paid_at or new.paid_amount_cents is distinct from old.paid_amount_cents) then
raise exception 'Data e valor pagos não podem mudar.';
end if;
if old.processor_fee_cents is not null and new.processor_fee_cents is distinct from old.processor_fee_cents then raise exception 'A tarifa já foi registrada.'; end if;
if new.status is distinct from old.status then
ok := case old.status
when 'aberta' then new.status in ('vencida','em_processamento','paga','cancelada')
when 'vencida' then new.status in ('em_processamento','paga','cancelada')
when 'em_processamento' then new.status in ('aberta','vencida','paga','cancelada')
when 'paga' then new.status = 'estornada'
else false end;
if not ok then raise exception 'Mudança de estado inválida: % para %.', old.status, new.status; end if;
end if;
new.updated_at := now();
return new;
end $$;

-- ============ 3) achar a fatura pela referência (atual ou antiga) ============
create or replace function public.platform_charge_of_ref(p_provider text, p_ref text) returns uuid
language sql stable security definer set search_path = public as $$
select coalesce((select r.charge_id from public.platform_charge_refs r where r.provider = p_provider and r.ref = p_ref),
(select c.id from public.platform_charges c where c.provider = p_provider and c.provider_ref = p_ref));
$$;

create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; other uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida') then raise exception 'Fatura não aceita nova página de pagamento agora.'; end if;
other := public.platform_charge_of_ref(p_provider, p_ref);
if other is not null and other <> p_charge then raise exception 'referencia_de_outra_fatura'; end if;
insert into public.platform_charge_refs (charge_id, provider, ref) values (p_charge, p_provider, p_ref) on conflict (provider, ref) do nothing;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;

-- ============ 4) andamento e confirmação: valem para qualquer referência da fatura; duplicidade vira evento visível ============
create or replace function public.platform_charge_progress(p_provider text, p_ref text, p_state text, p_now timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; ns text; v_id uuid; d date := (p_now at time zone 'America/Sao_Paulo')::date;
begin
if p_state not in ('processing','failed') then raise exception 'Estado inválido.'; end if;
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status in ('paga','cancelada','estornada') then return c.status; end if;
if c.provider_ref is distinct from p_ref and p_state = 'failed' then return c.status; end if;
ns := case when p_state = 'processing' then 'em_processamento' when c.due_date < d then 'vencida' else 'aberta' end;
if ns <> c.status then update public.platform_charges set status = ns where id = c.id; end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return ns;
end $$;

create or replace function public.platform_charge_confirm(p_provider text, p_ref text, p_paid_cents bigint, p_fee_cents bigint default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; v_id uuid;
begin
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status in ('paga','estornada') then
if c.paid_ref is distinct from p_ref then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason)
values (p_provider, 'dup:' || p_ref, 'pagamento_duplicado', c.id, 'rejeitado', left('pago antes por ' || coalesce(c.paid_ref, '?') || '; devolver o valor de ' || p_ref, 300)) on conflict do nothing;
return jsonb_build_object('charge', c.id, 'already', true, 'duplicate', true);
end if;
return jsonb_build_object('charge', c.id, 'already', true);
end if;
if c.status = 'cancelada' then raise exception 'cobranca_cancelada'; end if;
if p_paid_cents is distinct from c.amount_cents then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > c.amount_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents, paid_ref = p_ref where id = c.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'receita', p_paid_cents);
if p_fee_cents is not null and p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
if c.kind in ('boost','highlight') and c.ref_id is not null then
update public.boosts set paid = true where id = c.ref_id and house_id = c.house_id;
end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return jsonb_build_object('charge', c.id, 'already', false, 'house', c.house_id);
end $$;

-- ============ 5) tarifa conhecida só depois do pagamento: grava uma vez (desconhecida continua nula, nunca zero) ============
create or replace function public.platform_charge_record_fee(p_provider text, p_ref text, p_fee_cents bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; v_id uuid;
begin
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status <> 'paga' or c.paid_ref is distinct from p_ref or c.processor_fee_cents is not null then return false; end if;
if p_fee_cents is null or p_fee_cents < 0 or p_fee_cents > c.amount_cents then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set processor_fee_cents = p_fee_cents where id = c.id;
if p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
return true;
end $$;

-- ============ 6) card de aviso da casa: só existe enquanto houver fatura em atraso ============
create or replace function public.my_house_billing_status(p_house uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p_h uuid := p_house; cfg jsonb := public.platform_billing_config(); d date := (now() at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); lvl text; s public.house_billing_state; items jsonb;
begin
if p_h is null then select id into p_h from public.houses where owner_id = auth.uid() limit 1; end if;
if p_h is null then return jsonb_build_object('house_id', null, 'level', 'ok', 'overdue', false, 'charges', '[]'::jsonb); end if;
if not (public.is_admin() or public.is_house_owner(p_h)) then raise exception 'not_allowed' using errcode = '42501'; end if;
lvl := public.house_billing_level(p_h);
select * into s from public.house_billing_state where house_id = p_h;
select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'description', c.description, 'amount_cents', c.amount_cents, 'due_date', c.due_date, 'status', c.status, 'methods', coalesce(cfg -> 'methods' -> c.kind, '[]'::jsonb),
'tolerance_end', public.billing_add_business_days(c.due_date, tol), 'total_on', public.billing_add_business_days(c.due_date, tol) + tdays + 1) order by c.due_date), '[]'::jsonb)
into items from public.platform_charges c where c.house_id = p_h and c.status in ('aberta','vencida','em_processamento') and c.due_date < d;
return jsonb_build_object('house_id', p_h, 'level', lvl, 'overdue', jsonb_array_length(items) > 0, 'charges', items, 'partial_since', s.since, 'total_since', s.total_since);
end $$;

-- ============ 7) permissões ============
revoke all on function public.platform_charge_of_ref(text, text), public.platform_charge_record_fee(text, text, bigint), public.my_house_billing_status(uuid) from public, anon, authenticated;

grant execute on function public.platform_charge_of_ref(text, text), public.platform_charge_record_fee(text, text, bigint) to service_role;

grant execute on function public.my_house_billing_status(uuid) to authenticated, service_role;

revoke all on public.platform_charge_refs from anon, authenticated;

grant select on public.platform_charge_refs to authenticated;

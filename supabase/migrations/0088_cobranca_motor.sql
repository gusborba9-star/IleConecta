-- Fase 4: motor da cobrança da plataforma às casas (Blueprint §18.5). Faturas, eventos do provedor, livro-razão próprio, avisos, tolerância em dias úteis
-- e suspensão parcial. Tudo desligado por padrão (billing_config.enabled = false): com a cobrança desligada o motor não emite, não avisa e não suspende.
-- Só entram no calendário as casas matriculadas pelo administrador. Não depende de provedor: quem confirma o pagamento é a função confirm, chamada pelo backend
-- depois que o provedor confirma. Registros financeiros não têm chave estrangeira para a casa: sobrevivem à exclusão da conta (retenção).

-- ============ 0) configuração: prazo do bloqueio total (opcional; vale 30 dias quando ausente) ============
create or replace function public.billing_config_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; x jsonb; kinds text[] := array['plan','extra_seat','credit_pack','highlight','boost']; meths text[] := array['card','card_recurring','pix'];
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a where a <> 'total_block_days') is distinct from array['enabled','methods','notice_days','provider','tolerance_business_days'] then return false; end if;
if m ? 'total_block_days' and (coalesce(jsonb_typeof(m -> 'total_block_days'), '') <> 'number' or (m ->> 'total_block_days') !~ '^[0-9]{1,2}$' or (m ->> 'total_block_days')::int not between 7 and 90) then return false; end if;
if coalesce(jsonb_typeof(m -> 'enabled'), '') <> 'boolean' then return false; end if;
foreach k in array array['notice_days','tolerance_business_days'] loop
if coalesce(jsonb_typeof(m -> k), '') <> 'number' or (m ->> k) !~ '^[0-9]{1,2}$' then return false; end if;
end loop;
if (m ->> 'notice_days')::int not between 1 and 15 then return false; end if;
if (m ->> 'tolerance_business_days')::int not between 0 and 10 then return false; end if;
foreach k in array array['provider','methods'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from (select array_agg(a order by a) from unnest(kinds) a) then return false; end if;
end loop;
foreach k in array kinds loop
if coalesce(jsonb_typeof(m -> 'provider' -> k), '') <> 'string' or (m -> 'provider' ->> k) !~ '^[a-z][a-z0-9_]{1,23}$' then return false; end if;
v := m -> 'methods' -> k;
if coalesce(jsonb_typeof(v), '') <> 'array' or jsonb_array_length(v) not between 1 and 3 then return false; end if;
for x in select jsonb_array_elements(v) loop
if coalesce(jsonb_typeof(x), '') <> 'string' or not ((x #>> '{}') = any (meths)) then return false; end if;
end loop;
if (select count(distinct e) from jsonb_array_elements_text(v) e) <> jsonb_array_length(v) then return false; end if;
end loop;
return true;
end $$;

create or replace function public.billing_total_days() returns int
language sql stable security definer set search_path = public as $$
select coalesce(nullif((public.platform_billing_config() ->> 'total_block_days'), '')::int, 30);
$$;

-- ============ 1) matrícula no calendário de cobrança e estado da casa ============
create table if not exists public.house_billing_plan (
house_id uuid primary key references public.houses(id) on delete cascade,
billing_day int not null check (billing_day between 1 and 28),
started_on date not null,
active boolean not null default true,
updated_at timestamptz not null default now()
);

create table if not exists public.house_billing_state (
house_id uuid primary key references public.houses(id) on delete cascade,
suspended boolean not null default false,
since timestamptz,
total boolean not null default false,
total_since timestamptz,
updated_at timestamptz not null default now()
);

alter table public.house_billing_state add column if not exists total boolean not null default false;

alter table public.house_billing_state add column if not exists total_since timestamptz;

-- ============ 2) faturas ============
create table if not exists public.platform_charges (
id uuid primary key default gen_random_uuid(),
house_id uuid not null,
kind text not null check (kind in ('plan','extra_seat','credit_pack','highlight','boost')),
item_key text not null check (char_length(item_key) between 1 and 60),
description text check (description is null or char_length(description) <= 200),
amount_cents bigint not null check (amount_cents between 100 and 5000000),
period_start date,
due_date date not null,
status text not null default 'aberta' check (status in ('aberta','vencida','em_processamento','paga','cancelada','estornada')),
ref_id uuid,
provider text check (provider is null or provider ~ '^[a-z][a-z0-9_]{1,23}$'),
provider_ref text check (provider_ref is null or char_length(provider_ref) between 1 and 200),
provider_method text check (provider_method is null or provider_method in ('card','card_recurring','pix')),
checkout_url text check (checkout_url is null or checkout_url ~ '^https://'),
paid_at timestamptz,
paid_amount_cents bigint check (paid_amount_cents is null or paid_amount_cents > 0),
processor_fee_cents bigint check (processor_fee_cents is null or processor_fee_cents >= 0),
idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 120),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
check ((status = 'paga') = (paid_at is not null) or status in ('estornada','cancelada'))
);

create unique index if not exists platform_charges_provider_ref on public.platform_charges (provider, provider_ref) where provider_ref is not null;

create unique index if not exists platform_charges_one_per_period on public.platform_charges (house_id, kind, item_key, period_start) where period_start is not null and status <> 'cancelada';

create index if not exists platform_charges_house on public.platform_charges (house_id, due_date desc);

create index if not exists platform_charges_open on public.platform_charges (status, due_date) where status in ('aberta','vencida','em_processamento');

-- ============ 3) eventos do provedor, livro-razão próprio e avisos ============
create table if not exists public.platform_billing_events (
id bigint generated always as identity primary key,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
event_id text not null check (char_length(event_id) between 1 and 200),
kind text not null check (char_length(kind) between 1 and 60),
charge_id uuid,
outcome text not null check (outcome in ('recebido','processado','rejeitado')),
reason text check (reason is null or char_length(reason) <= 300),
created_at timestamptz not null default now(),
unique (provider, event_id)
);

create table if not exists public.platform_ledger_entries (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
entry_type text not null check (entry_type in ('receita','taxa_provedor','estorno')),
amount_cents bigint not null check (amount_cents <> 0),
created_at timestamptz not null default now()
);

create index if not exists platform_ledger_charge on public.platform_ledger_entries (charge_id);

create table if not exists public.platform_billing_notices (
id bigint generated always as identity primary key,
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
stage text not null check (stage in ('fatura_disponivel','vespera','dia_vencimento','tolerancia','suspensao','total_em_breve')),
created_at timestamptz not null default now(),
unique (charge_id, stage)
);

-- ============ 4) proteções: livro-razão e eventos imutáveis; fatura só muda pelo caminho certo ============
create or replace function public.platform_billing_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
raise exception 'Registro financeiro da plataforma não pode ser alterado nem apagado.';
end $$;

drop trigger if exists trg_platform_ledger_immutable on public.platform_ledger_entries;

create trigger trg_platform_ledger_immutable before update or delete on public.platform_ledger_entries
for each row execute function public.platform_billing_immutable();

drop trigger if exists trg_platform_events_immutable on public.platform_billing_events;

create trigger trg_platform_events_immutable before update or delete on public.platform_billing_events
for each row execute function public.platform_billing_immutable();

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
if old.provider_ref is not null and (new.provider_ref is distinct from old.provider_ref or new.provider is distinct from old.provider) then
raise exception 'A referência do provedor já foi definida e não pode mudar.';
end if;
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

drop trigger if exists trg_platform_charges_guard on public.platform_charges;

create trigger trg_platform_charges_guard before update or delete on public.platform_charges
for each row execute function public.platform_charges_guard();

-- ============ 5) quem lê o quê (ninguém escreve direto: só as funções abaixo) ============
alter table public.house_billing_plan enable row level security;
alter table public.house_billing_state enable row level security;
alter table public.platform_charges enable row level security;
alter table public.platform_billing_events enable row level security;
alter table public.platform_ledger_entries enable row level security;
alter table public.platform_billing_notices enable row level security;

drop policy if exists hbp_read on public.house_billing_plan;
create policy hbp_read on public.house_billing_plan for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists hbs_read on public.house_billing_state;
create policy hbs_read on public.house_billing_state for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists pc_read on public.platform_charges;
create policy pc_read on public.platform_charges for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists pbe_read on public.platform_billing_events;
create policy pbe_read on public.platform_billing_events for select to authenticated using (public.is_admin());

drop policy if exists ple_read on public.platform_ledger_entries;
create policy ple_read on public.platform_ledger_entries for select to authenticated using (public.is_admin());

drop policy if exists pbn_read on public.platform_billing_notices;
create policy pbn_read on public.platform_billing_notices for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

-- ============ 6) avisos (sino da casa; texto sem cobrança de culpa, sem selo) ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
msg := case p_stage
when 'fatura_disponivel' then 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.'
when 'vespera' then 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').'
when 'dia_vencimento' then 'Sua fatura da plataforma vence hoje.'
when 'suspensao' then 'Sua casa está com a suspensão parcial: sem vendas novas, campanhas, destaque, impulsionamento e assistente. Pague a fatura para voltar ao normal.'
when 'total_em_breve' then 'Atenção: se a fatura da plataforma continuar em aberto, sua casa será bloqueada por completo em ' || to_char(tol_end + public.billing_total_days() + 1, 'DD/MM') || '. Pague para evitar.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

-- ============ 7) emitir fatura (idempotente; só com a cobrança ligada) ============
create or replace function public.platform_charge_issue(p_house uuid, p_kind text, p_item_key text, p_amount bigint, p_due date, p_period_start date, p_description text, p_idem text, p_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; ex public.platform_charges;
begin
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
if p_kind not in ('plan','extra_seat','credit_pack','highlight','boost') then raise exception 'Tipo de cobrança inválido.'; end if;
if p_amount is null or p_amount not between 100 and 5000000 then raise exception 'Valor da fatura inválido.'; end if;
if p_due is null or p_due < current_date - 400 or p_due > current_date + 400 then raise exception 'Vencimento inválido.'; end if;
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
insert into public.platform_charges (house_id, kind, item_key, description, amount_cents, period_start, due_date, ref_id, idempotency_key)
values (p_house, p_kind, p_item_key, left(p_description, 200), p_amount, p_period_start, p_due, p_ref, p_idem)
on conflict (idempotency_key) do nothing returning platform_charges.id into v_id;
if v_id is null then
select * into ex from public.platform_charges where idempotency_key = p_idem;
if ex.house_id <> p_house or ex.kind <> p_kind or ex.amount_cents <> p_amount or ex.due_date <> p_due then raise exception 'idempotencia_conflitante'; end if;
return ex.id;
end if;
perform public.platform_billing_notice(v_id, 'fatura_disponivel');
return v_id;
end $$;

-- ============ 8) provedor: guardar a referência (uma vez), andamento do pagamento e confirmação ============
create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida','em_processamento') then raise exception 'Fatura não está em aberto.'; end if;
if c.provider_ref is not null and (c.provider is distinct from p_provider or c.provider_ref is distinct from p_ref) then raise exception 'referencia_ja_definida'; end if;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;

create or replace function public.platform_charge_progress(p_provider text, p_ref text, p_state text, p_now timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; ns text; d date := (p_now at time zone 'America/Sao_Paulo')::date;
begin
if p_state not in ('processing','failed') then raise exception 'Estado inválido.'; end if;
select * into c from public.platform_charges where provider = p_provider and provider_ref = p_ref for update;
if not found then raise exception 'cobranca_desconhecida'; end if;
if c.status in ('paga','cancelada','estornada') then return c.status; end if;
ns := case when p_state = 'processing' then 'em_processamento' when c.due_date < d then 'vencida' else 'aberta' end;
if ns <> c.status then update public.platform_charges set status = ns where id = c.id; end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return ns;
end $$;

create or replace function public.platform_charge_confirm(p_provider text, p_ref text, p_paid_cents bigint, p_fee_cents bigint default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
select * into c from public.platform_charges where provider = p_provider and provider_ref = p_ref for update;
if not found then raise exception 'cobranca_desconhecida'; end if;
if c.status in ('paga','estornada') then return jsonb_build_object('charge', c.id, 'already', true); end if;
if c.status = 'cancelada' then raise exception 'cobranca_cancelada'; end if;
if p_paid_cents is distinct from c.amount_cents then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > c.amount_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents where id = c.id;
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

create or replace function public.platform_charge_cancel(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida','em_processamento') then raise exception 'Só faturas em aberto podem ser canceladas.'; end if;
update public.platform_charges set status = 'cancelada' where id = c.id;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_cancel', jsonb_build_object('charge', c.id, 'status', c.status), jsonb_build_object('reason', left(btrim(p_reason), 300)));
perform public.platform_house_billing_recompute(c.house_id);
end $$;

-- ============ 9) suspensão parcial: tolerância em dias úteis; nunca suspende com pagamento em processamento ============
create or replace function public.platform_house_billing_recompute(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); late boolean; fully boolean; proc boolean; susp boolean; tot boolean; was boolean; wast boolean;
begin
if not exists (select 1 from public.houses where id = p_house) then return false; end if;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) < d) into late;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) + tdays < d) into fully;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.status = 'em_processamento') into proc;
susp := coalesce((cfg ->> 'enabled')::boolean, false) and late and not proc;
tot := susp and fully;
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

create or replace function public.house_billing_blocked(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) and coalesce((select s.suspended from public.house_billing_state s where s.house_id = h), false);
$$;

-- nível da casa: 'ok', 'parcial' (sem venda nova, campanha, destaque, impulsionamento e assistente) ou 'total' (fora da descoberta e do feed; painel só leitura)
create or replace function public.house_billing_level(h uuid) returns text
language sql stable security definer set search_path = public as $$
select case when not coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) then 'ok'
when coalesce((select s.total from public.house_billing_state s where s.house_id = h), false) then 'total'
when coalesce((select s.suspended from public.house_billing_state s where s.house_id = h), false) then 'parcial'
else 'ok' end;
$$;

-- ============ 10) rotina diária: emite as faturas do ciclo, marca vencidas, avisa e recalcula a suspensão ============
create or replace function public.platform_billing_tick(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; nd int; tol int; tdays int := public.billing_total_days(); nday int := (public.platform_billing_config() ->> 'notice_days')::int; total_on date; pricing jsonb; prices jsonb;
h record; c record; m int; cand date; due date; amt bigint; seats int; issued int := 0; late int := 0; notices int := 0; houses int := 0; tol_end date;
begin
if coalesce((cfg ->> 'enabled')::boolean, false) is not true then return jsonb_build_object('skipped', 'cobranca_desligada'); end if;
nd := (cfg ->> 'notice_days')::int; tol := (cfg ->> 'tolerance_business_days')::int;
select value into pricing from public.platform_settings where key = 'pricing';
prices := public.platform_billing_prices();
for h in select p.house_id, p.billing_day, p.started_on, hs.plan::text as plan from public.house_billing_plan p join public.houses hs on hs.id = p.house_id where p.active loop
begin
for m in -1..1 loop
cand := (date_trunc('month', d)::date + make_interval(months => m))::date + (h.billing_day - 1);
continue when cand - nd < h.started_on or cand < d - 31;
due := greatest(cand, d + nd);
amt := case when (pricing -> 'plans' -> h.plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((pricing -> 'plans' -> h.plan ->> 'monthly')::numeric * 100)::bigint end;
if amt is not null and cand - nd <= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'plan:' || h.house_id || ':' || cand) then
perform public.platform_charge_issue(h.house_id, 'plan', 'plan:' || h.plan, amt, due, cand, 'Mensalidade do plano', 'plan:' || h.house_id || ':' || cand);
issued := issued + 1;
end if;
exception when unique_violation then null;
end;
end if;
select coalesce(s.seats, 0) into seats from public.house_extra_seats s where s.house_id = h.house_id;
amt := case when coalesce(seats, 0) > 0 and (prices -> 'extra_seat' ->> h.plan) ~ '^[0-9]+$' then seats * (prices -> 'extra_seat' ->> h.plan)::bigint end;
if amt is not null and cand - nd <= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'extra_seat:' || h.house_id || ':' || cand) then
perform public.platform_charge_issue(h.house_id, 'extra_seat', 'extra_seat', amt, due, cand, 'Vagas adicionais de equipe (' || seats || ')', 'extra_seat:' || h.house_id || ':' || cand);
issued := issued + 1;
end if;
exception when unique_violation then null;
end;
end if;
end loop;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_emissao', 'rejeitado', left(h.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
update public.platform_charges pc set status = 'cancelada' where pc.status in ('aberta','vencida') and not exists (select 1 from public.houses x where x.id = pc.house_id);
update public.platform_charges set status = 'vencida' where status = 'aberta' and due_date < d;
get diagnostics late = row_count;
for c in select id, due_date from public.platform_charges where status in ('aberta','vencida') loop
begin
tol_end := public.billing_add_business_days(c.due_date, tol);
if public.platform_billing_notice(c.id, 'fatura_disponivel') then notices := notices + 1; end if;
if d >= c.due_date - 1 and d < c.due_date and public.platform_billing_notice(c.id, 'vespera') then notices := notices + 1; end if;
if d >= c.due_date and public.platform_billing_notice(c.id, 'dia_vencimento') then notices := notices + 1; end if;
if d > c.due_date and d <= tol_end and public.platform_billing_notice(c.id, 'tolerancia') then notices := notices + 1; end if;
if d > tol_end and public.platform_billing_notice(c.id, 'suspensao') then notices := notices + 1; end if;
total_on := tol_end + tdays + 1;
if d >= total_on - nday and d < total_on and public.platform_billing_notice(c.id, 'total_em_breve') then notices := notices + 1; end if;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_aviso', c.id, 'rejeitado', left(sqlerrm, 300));
end;
end loop;
for h in select distinct x.house_id from (select house_id from public.platform_charges where status in ('aberta','vencida','em_processamento') union select house_id from public.house_billing_state where suspended) x loop
begin
perform public.platform_house_billing_recompute(h.house_id, p_now);
houses := houses + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_recalculo', 'rejeitado', left(h.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return jsonb_build_object('issued', issued, 'overdue', late, 'notices', notices, 'houses_checked', houses);
end $$;

-- ============ 11) administrador: matricular casa no calendário de cobrança (nada é cobrado de quem não foi matriculado) ============
create or replace function public.admin_billing_enroll(p_house uuid, p_day int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
if p_day is null or p_day not between 1 and 28 then raise exception 'O dia de vencimento deve ficar entre 1 e 28.'; end if;
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (p_house, p_day, (now() at time zone 'America/Sao_Paulo')::date, true)
on conflict (house_id) do update set billing_day = excluded.billing_day, active = true, updated_at = now(),
started_on = case when public.house_billing_plan.active then public.house_billing_plan.started_on else excluded.started_on end;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_enroll', null, jsonb_build_object('house', p_house, 'day', p_day, 'reason', left(btrim(p_reason), 300)));
end $$;

create or replace function public.admin_billing_unenroll(p_house uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then raise exception 'A casa não está matriculada.'; end if;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_unenroll', null, jsonb_build_object('house', p_house, 'reason', left(btrim(p_reason), 300)));
end $$;

-- ============ 12) suspensão parcial: nenhuma venda ou reserva nova pela plataforma, nenhuma campanha nova; o que já estava em andamento termina ============
create or replace function public.payments_billing_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
if new.member_due_id is not null then return new; end if;
h := coalesce((select e.house_id from public.reservations r join public.events e on e.id = r.event_id where r.id = new.reservation_id), (select o.house_id from public.service_orders o where o.id = new.order_id));
if h is null or not public.house_billing_blocked(h) then return new; end if;
if exists (select 1 from public.payments p where p.id is distinct from new.id and p.status in ('confirmado','estornado_parcial')
and ((new.reservation_id is not null and p.reservation_id = new.reservation_id) or (new.order_id is not null and p.order_id = new.order_id))) then return new; end if;
raise exception 'Esta casa não está recebendo novos pedidos pela plataforma no momento.';
end $$;

drop trigger if exists trg_payments_billing_block on public.payments;

create trigger trg_payments_billing_block before insert on public.payments
for each row execute function public.payments_billing_block();

create or replace function public.campaigns_billing_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if public.house_billing_blocked(new.house_id) then raise exception 'Novas campanhas ficam pausadas enquanto a fatura da plataforma estiver em atraso.'; end if;
return new;
end $$;

drop trigger if exists trg_house_campaigns_billing_block on public.house_campaigns;

create trigger trg_house_campaigns_billing_block before insert on public.house_campaigns
for each row execute function public.campaigns_billing_block();

-- ============ 13) permissões ============
revoke all on function public.platform_billing_immutable(), public.platform_charges_guard(), public.platform_billing_notice(uuid, text), public.platform_charge_issue(uuid, text, text, bigint, date, date, text, text, uuid), public.platform_charge_attach(uuid, text, text, text, text), public.platform_charge_progress(text, text, text, timestamptz), public.platform_charge_confirm(text, text, bigint, bigint, timestamptz), public.platform_charge_cancel(uuid, text), public.platform_house_billing_recompute(uuid, timestamptz), public.house_billing_blocked(uuid), public.house_billing_level(uuid), public.billing_total_days(), public.platform_billing_tick(timestamptz), public.admin_billing_enroll(uuid, int, text), public.admin_billing_unenroll(uuid, text), public.payments_billing_block(), public.campaigns_billing_block() from public, anon, authenticated;

grant execute on function public.platform_billing_notice(uuid, text), public.platform_charge_issue(uuid, text, text, bigint, date, date, text, text, uuid), public.platform_charge_attach(uuid, text, text, text, text), public.platform_charge_progress(text, text, text, timestamptz), public.platform_charge_confirm(text, text, bigint, bigint, timestamptz), public.platform_house_billing_recompute(uuid, timestamptz), public.house_billing_blocked(uuid), public.house_billing_level(uuid), public.billing_total_days(), public.platform_billing_tick(timestamptz) to service_role;

grant execute on function public.platform_charge_cancel(uuid, text), public.admin_billing_enroll(uuid, int, text), public.admin_billing_unenroll(uuid, text) to authenticated;

revoke all on public.house_billing_plan, public.house_billing_state, public.platform_charges, public.platform_billing_events, public.platform_ledger_entries, public.platform_billing_notices from anon, authenticated;

grant select on public.house_billing_plan, public.house_billing_state, public.platform_charges, public.platform_billing_events, public.platform_ledger_entries, public.platform_billing_notices to authenticated;

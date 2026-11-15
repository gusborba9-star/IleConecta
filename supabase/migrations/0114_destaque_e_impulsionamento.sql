-- 0114 — Venda de destaque e impulsionamento (decisões do proprietário, 14/11/2026).
-- Destaque: a casa inteira nas buscas, por cidade, estado ou país, com número máximo de casas por alcance (3 / 6 / 15; editável no admin).
-- Impulsionamento: um serviço ou ritual da casa levado a mais gente na cidade, no estado ou no país (sem limite de vagas).
-- Tempo: o relógio começa na ENTREGA (pagamento validado). Cada dia é um bloco de 24 horas contado dali; o 1º dia já conta como usado.
-- Nova compra do MESMO item e MESMO alcance soma os dias ao final (entra quando a anterior terminar). Itens ou alcances diferentes são compras independentes.
-- Reembolso (até 7 dias do pagamento): devolve (valor pago / dias) x dias que ainda NÃO começaram; o dia em andamento continua até o fim do bloco.
-- Não iniciada = valor integral. A tarifa do provedor não é descontada (a plataforma absorve).
-- Suspensão por falta de pagamento: o relógio pausa e volta a correr quando a casa regulariza. O preço vem sempre do painel (setting pricing), nunca da tela.
-- Compra exige a autorização expressa de início imediato (carimbo de data no banco).

-- ============ 1) vagas do destaque por alcance (editável no admin) ============
create table if not exists public.promo_limits (
scope text primary key check (scope in ('cidade', 'estado', 'pais')),
highlight_slots int not null check (highlight_slots between 1 and 1000),
updated_at timestamptz not null default now()
);

insert into public.promo_limits (scope, highlight_slots) values ('cidade', 3), ('estado', 6), ('pais', 15) on conflict (scope) do nothing;

alter table public.promo_limits enable row level security;

drop policy if exists promo_limits_read on public.promo_limits;

create policy promo_limits_read on public.promo_limits for select to authenticated using (true);

-- ============ 2) compras ============
create table if not exists public.promotions (
id uuid primary key default gen_random_uuid(),
house_id uuid not null references public.houses(id) on delete cascade,
kind text not null check (kind in ('boost', 'highlight')),
scope text not null check (scope in ('cidade', 'estado', 'pais')),
item_type text check (item_type in ('service', 'event')),
item_id uuid,
days int not null check (days between 1 and 90),
amount_cents bigint not null check (amount_cents between 100 and 5000000),
charge_id uuid unique references public.platform_charges(id) on delete restrict,
authorized_at timestamptz not null,
status text not null default 'aguardando' check (status in ('aguardando', 'ativa', 'encerrada', 'reembolsada', 'cancelada')),
starts_at timestamptz,
paused_seconds bigint not null default 0 check (paused_seconds >= 0),
pause_started_at timestamptz,
delivered_at timestamptz,
end_notice_at timestamptz,
city_key text,
state_key text,
country text,
created_at timestamptz not null default now(),
check ((kind = 'boost' and item_id is not null and item_type is not null) or (kind = 'highlight' and item_id is null and item_type is null))
);

create index if not exists promotions_house on public.promotions (house_id, status);

create index if not exists promotions_live on public.promotions (kind, scope, status) where status in ('aguardando', 'ativa');

alter table public.promotions enable row level security;

drop policy if exists promotions_read on public.promotions;

create policy promotions_read on public.promotions for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.promotions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Compra de destaque ou impulsionamento não pode ser apagada.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.kind is distinct from old.kind or new.scope is distinct from old.scope
or new.item_type is distinct from old.item_type or new.item_id is distinct from old.item_id or new.amount_cents is distinct from old.amount_cents
or new.authorized_at is distinct from old.authorized_at or new.created_at is distinct from old.created_at
or (old.charge_id is not null and new.charge_id is distinct from old.charge_id) then
raise exception 'Dados da compra não podem ser alterados.';
end if;
return new;
end $$;

drop trigger if exists trg_promotions_guard on public.promotions;

create trigger trg_promotions_guard before update or delete on public.promotions for each row execute function public.promotions_guard();

-- fila de espera do destaque (aviso quando abrir vaga)
create table if not exists public.promo_waitlist (
house_id uuid not null references public.houses(id) on delete cascade,
scope text not null check (scope in ('cidade', 'estado', 'pais')),
created_at timestamptz not null default now(),
primary key (house_id, scope)
);

alter table public.promo_waitlist enable row level security;

drop policy if exists promo_waitlist_read on public.promo_waitlist;

create policy promo_waitlist_read on public.promo_waitlist for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

-- ============ 3) reembolsos ============
create table if not exists public.promo_refunds (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
promotion_id uuid not null references public.promotions(id) on delete restrict,
reason text not null default 'pedido' check (reason in ('pedido', 'sem_vaga')),
days_refunded int not null check (days_refunded > 0),
days_used int not null check (days_used >= 0),
prev_days int not null check (prev_days > 0),
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

create unique index if not exists promo_refunds_one_active on public.promo_refunds (charge_id) where status in ('pendente', 'concluido');

alter table public.promo_refunds enable row level security;

drop policy if exists promo_refunds_read on public.promo_refunds;

create policy promo_refunds_read on public.promo_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.promo_refunds_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reembolso não pode ser apagado.'; end if;
if old.status <> 'pendente' then raise exception 'Reembolso encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.charge_id is distinct from old.charge_id or new.house_id is distinct from old.house_id or new.promotion_id is distinct from old.promotion_id
or new.days_refunded is distinct from old.days_refunded or new.days_used is distinct from old.days_used or new.prev_days is distinct from old.prev_days
or new.amount_cents is distinct from old.amount_cents or new.reason is distinct from old.reason or new.created_at is distinct from old.created_at then
raise exception 'Valor e dias do reembolso não podem ser alterados.';
end if;
new.updated_at := now();
return new;
end $$;

drop trigger if exists trg_promo_refunds_guard on public.promo_refunds;

create trigger trg_promo_refunds_guard before update or delete on public.promo_refunds for each row execute function public.promo_refunds_guard();

-- ============ 4) auxiliares de tempo (puros: recebem o "agora", então são testáveis no tempo) ============
create or replace function public.promo_norm(t text) returns text
language sql immutable set search_path = public as $$
select nullif(btrim(translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '');
$$;

create or replace function public.promo_paused_secs(p public.promotions, p_now timestamptz) returns numeric
language sql immutable set search_path = public as $$
select p.paused_seconds + coalesce(greatest(extract(epoch from p_now - p.pause_started_at), 0), 0);
$$;

create or replace function public.promo_eff_start(p public.promotions, p_now timestamptz) returns timestamptz
language sql immutable set search_path = public as $$
select p.starts_at + make_interval(secs => public.promo_paused_secs(p, p_now)::double precision);
$$;

create or replace function public.promo_eff_end(p public.promotions, p_now timestamptz) returns timestamptz
language sql immutable set search_path = public as $$
select public.promo_eff_start(p, p_now) + p.days * interval '24 hours';
$$;

-- blocos de 24 horas já iniciados (o 1º conta na entrega). Ainda não começou = 0. Nunca passa do total de dias.
create or replace function public.promo_blocks_started(p public.promotions, p_now timestamptz) returns int
language sql immutable set search_path = public as $$
select case when p.starts_at is null or p_now < public.promo_eff_start(p, p_now) then 0
else least(p.days, floor(extract(epoch from p_now - public.promo_eff_start(p, p_now)) / 86400)::int + 1) end;
$$;

-- valor a devolver: proporcional, inteiro em centavos, meio centavo para cima, nunca acima do pago
create or replace function public.promo_refund_cents(p_paid bigint, p_unused int, p_days int) returns bigint
language sql immutable set search_path = public as $$
select least(p_paid, (p_paid * p_unused * 2 + p_days) / (p_days * 2));
$$;

-- ============ 5) regras de local, vagas, fila e preço ============
create or replace function public.promo_feature_on(p_kind text, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((
select case f ->> 'state' when 'on' then true when 'beta' then p_owner is not null and (f -> 'beta_houses') ? p_owner::text else false end
from (select value -> (case p_kind when 'boost' then 'boost' else 'highlight' end) as f from public.platform_settings where key = 'features') x
where jsonb_typeof(f) = 'object'), false);
$$;

create or replace function public.promo_house_paused(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select public.house_billing_level(h) <> 'ok';
$$;

-- vagas ocupadas por OUTRAS casas no mesmo alcance e local (reserva de pagamento pendente vale por 1 hora)
create or replace function public.promo_slots_taken(p_scope text, p_city text, p_state text, p_country text, p_exclude uuid, p_now timestamptz default now()) returns int
language sql stable security definer set search_path = public as $$
select count(distinct p.house_id)::int from public.promotions p
where p.kind = 'highlight' and p.scope = p_scope and p.house_id is distinct from p_exclude
and (case p_scope when 'cidade' then p.city_key is not distinct from p_city and p.state_key is not distinct from p_state
when 'estado' then p.state_key is not distinct from p_state else p.country is not distinct from p_country end)
and ((p.status = 'ativa' and public.promo_eff_end(p, p_now) > p_now) or (p.status = 'aguardando' and p.created_at > p_now - interval '1 hour'));
$$;

-- fim da fila do mesmo item e alcance (nulo = nada ativo)
create or replace function public.promo_chain_end(p_house uuid, p_kind text, p_scope text, p_item uuid, p_now timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = public as $$
select max(public.promo_eff_end(p, p_now)) from public.promotions p
where p.house_id = p_house and p.kind = p_kind and p.scope = p_scope and p.item_id is not distinct from p_item and p.status = 'ativa' and public.promo_eff_end(p, p_now) > p_now;
$$;

-- recoloca em fila as compras que ainda não começaram (depois de um reembolso, a de trás adianta)
create or replace function public.promo_rechain(p_house uuid, p_kind text, p_scope text, p_item uuid, p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = public as $$
declare r public.promotions; prev_end timestamptz := null; prev_pause timestamptz := null; paused boolean := public.promo_house_paused(p_house);
begin
for r in select * from public.promotions p where p.house_id = p_house and p.kind = p_kind and p.scope = p_scope and p.item_id is not distinct from p_item and p.status = 'ativa'
order by p.delivered_at, p.created_at, p.id for update loop
if public.promo_eff_start(r, p_now) > p_now or r.starts_at is null then
-- ainda não começou: entra logo depois da anterior (ou agora, se não sobrou anterior)
update public.promotions set starts_at = coalesce(prev_end, p_now), paused_seconds = 0, pause_started_at = case when paused then coalesce(prev_pause, p_now) else null end where id = r.id returning * into r;
end if;
prev_end := r.starts_at + make_interval(secs => r.paused_seconds::double precision) + r.days * interval '24 hours';
prev_pause := r.pause_started_at;
end loop;
end $$;

-- ============ 6) entrega (roda sozinha quando a cobrança vira "paga") ============
create or replace function public.promotion_deliver(p_charge uuid, p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.promotions; c public.platform_charges; v_chain timestamptz; v_start timestamptz; v_limit int; v_taken int; v_owner uuid; v_label text; v_end timestamptz;
begin
select * into pr from public.promotions where charge_id = p_charge for update;
if not found or pr.status not in ('aguardando', 'cancelada') then return; end if;
select * into c from public.platform_charges where id = p_charge;
perform pg_advisory_xact_lock(hashtextextended('promo:' || pr.house_id::text, 0));
if pr.kind = 'highlight' then
perform pg_advisory_xact_lock(hashtextextended('promoslot:' || pr.scope || ':' || coalesce(pr.city_key, '') || ':' || coalesce(pr.state_key, '') || ':' || coalesce(pr.country, ''), 0));
end if;
v_chain := public.promo_chain_end(pr.house_id, pr.kind, pr.scope, pr.item_id, p_now);
if pr.kind = 'highlight' and v_chain is null then
select highlight_slots into v_limit from public.promo_limits where scope = pr.scope;
v_taken := public.promo_slots_taken(pr.scope, pr.city_key, pr.state_key, pr.country, pr.house_id, p_now);
if v_taken >= coalesce(v_limit, 0) then
-- pagou, mas a vaga acabou enquanto o pagamento era confirmado: devolve tudo
update public.promotions set status = 'cancelada' where id = pr.id;
if c.paid_amount_cents is not null and c.paid_ref is not null and c.provider is not null then
insert into public.promo_refunds (charge_id, house_id, promotion_id, reason, days_refunded, days_used, prev_days, amount_cents, provider)
values (c.id, pr.house_id, pr.id, 'sem_vaga', pr.days, 0, pr.days, c.paid_amount_cents, c.provider) on conflict do nothing;
end if;
select owner_id into v_owner from public.houses where id = pr.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'As vagas de destaque deste alcance acabaram antes de o seu pagamento ser confirmado. Devolvemos o valor integral. Você pode entrar na lista de espera.', '/destaques');
end if;
return;
end if;
end if;
v_start := greatest(p_now, coalesce(v_chain, p_now));
update public.promotions set status = 'ativa', starts_at = v_start, delivered_at = p_now, paused_seconds = 0,
pause_started_at = case when public.promo_house_paused(pr.house_id) then p_now else null end where id = pr.id returning * into pr;
delete from public.promo_waitlist where house_id = pr.house_id and scope = pr.scope and pr.kind = 'highlight';
v_end := public.promo_eff_end(pr, p_now);
select owner_id into v_owner from public.houses where id = pr.house_id;
v_label := case pr.kind when 'highlight' then 'O destaque da sua casa' else 'O impulsionamento' end;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner,
case when v_chain is null then v_label || ' começou e vai até ' || to_char(v_end at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.'
else 'Os dias novos foram somados: ' || lower(v_label) || ' continua até ' || to_char(v_end at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.' end,
case pr.kind when 'highlight' then '/destaques' else '/impulsionar' end);
end if;
end $$;

create or replace function public.promotions_on_charge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if new.kind not in ('boost', 'highlight') then return new; end if;
if new.status = 'paga' and old.status is distinct from 'paga' then
perform public.promotion_deliver(new.id, now());
elsif new.status = 'cancelada' and old.status is distinct from 'cancelada' then
update public.promotions set status = 'cancelada' where charge_id = new.id and status = 'aguardando';
end if;
return new;
end $$;

drop trigger if exists trg_promotions_on_charge on public.platform_charges;

create trigger trg_promotions_on_charge after update of status on public.platform_charges
for each row when (new.status is distinct from old.status) execute function public.promotions_on_charge();

-- suspensão pausa o relógio; regularizar faz voltar a correr
create or replace function public.promotions_sync_pause() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paused boolean := public.promo_house_paused(new.house_id);
begin
if v_paused then
update public.promotions set pause_started_at = now() where house_id = new.house_id and status = 'ativa' and pause_started_at is null;
else
update public.promotions set paused_seconds = paused_seconds + round(extract(epoch from now() - pause_started_at))::bigint, pause_started_at = null
where house_id = new.house_id and status = 'ativa' and pause_started_at is not null;
end if;
return new;
end $$;

drop trigger if exists trg_promotions_sync_pause on public.house_billing_state;

create trigger trg_promotions_sync_pause after insert or update on public.house_billing_state
for each row execute function public.promotions_sync_pause();

-- ============ 7) compra (chamada só pelo servidor de cobrança) ============
create or replace function public.platform_promo_purchase(p_house uuid, p_kind text, p_scope text, p_days int, p_item_type text, p_item_id uuid, p_authorized boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare h public.houses; v_city text; v_state text; v_country text; v_unit numeric; v_price bigint; v_id uuid; v_charge uuid; v_chain timestamptz; v_start timestamptz;
v_limit int; v_taken int; v_title text; v_ev timestamptz; v_max int; v_item uuid := p_item_id; v_itype text := p_item_type; ex public.promotions; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
if p_kind not in ('boost', 'highlight') then raise exception 'Tipo inválido.'; end if;
if p_scope not in ('cidade', 'estado', 'pais') then raise exception 'Alcance inválido.'; end if;
if p_days is null or p_days not between 1 and 90 then raise exception 'Escolha de 1 a 90 dias.'; end if;
if p_authorized is not true then raise exception 'Marque a autorização de início imediato para continuar.'; end if;
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
perform pg_advisory_xact_lock(hashtextextended('promo:' || p_house::text, 0));
select * into h from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
if not public.promo_feature_on(p_kind, h.owner_id) then raise exception 'Este recurso ainda não está disponível para a sua casa.'; end if;
if public.house_billing_level(p_house) <> 'ok' then raise exception 'Regularize a fatura em atraso para contratar.'; end if;
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = h.owner_id;
if p_scope = 'cidade' and (v_city is null or v_state is null) then raise exception 'Complete a cidade e o estado no perfil da casa para contratar por cidade.'; end if;
if p_scope = 'estado' and v_state is null then raise exception 'Complete o estado no perfil da casa para contratar por estado.'; end if;
if p_kind = 'boost' then
if v_itype = 'service' then
select title into v_title from public.services where id = v_item and house_id = p_house and active and listed;
if v_title is null then raise exception 'Só serviços ativos da sua casa podem ser impulsionados.'; end if;
elsif v_itype = 'event' then
select title, starts_at into v_title, v_ev from public.events where id = v_item and house_id = p_house and status = 'publicado' and starts_at > now();
if v_title is null then raise exception 'Só rituais publicados e que ainda vão acontecer podem ser impulsionados.'; end if;
else
raise exception 'Escolha o serviço ou ritual que será impulsionado.';
end if;
else
v_item := null; v_itype := null; v_title := h.name;
end if;
select * into ex from public.promotions pr where pr.house_id = p_house and pr.kind = p_kind and pr.scope = p_scope and pr.days = p_days and pr.item_id is not distinct from v_item
and pr.status = 'aguardando' and pr.created_at > now() - interval '1 hour' and pr.charge_id is not null
and exists (select 1 from public.platform_charges c where c.id = pr.charge_id and c.status = 'aberta') order by pr.created_at desc limit 1;
if found then return ex.charge_id; end if;
v_chain := public.promo_chain_end(p_house, p_kind, p_scope, v_item, now());
v_start := greatest(now(), coalesce(v_chain, now()));
if v_ev is not null then
v_max := floor(extract(epoch from v_ev - v_start) / 86400)::int;
if v_max < 1 then raise exception 'Este ritual acontece antes de um dia inteiro de impulsionamento.'; end if;
if p_days > v_max then raise exception 'O impulsionamento precisa terminar antes do ritual: no máximo % dia(s) para este ritual.', v_max; end if;
end if;
if p_kind = 'highlight' and v_chain is null then
perform pg_advisory_xact_lock(hashtextextended('promoslot:' || p_scope || ':' || coalesce(case p_scope when 'cidade' then v_city end, '') || ':' || coalesce(case when p_scope in ('cidade', 'estado') then v_state end, '') || ':' || coalesce(case p_scope when 'pais' then v_country end, ''), 0));
select highlight_slots into v_limit from public.promo_limits where scope = p_scope;
v_taken := public.promo_slots_taken(p_scope, case p_scope when 'cidade' then v_city end, case when p_scope in ('cidade', 'estado') then v_state end, case p_scope when 'pais' then v_country end, p_house, now());
if v_taken >= coalesce(v_limit, 0) then raise exception 'sem_vaga'; end if;
end if;
select nullif(value -> (case p_kind when 'boost' then 'boost_per_day' else 'highlight_per_day' end) ->> p_scope, '')::numeric into v_unit from public.platform_settings where key = 'pricing';
if v_unit is null or v_unit <= 0 then raise exception 'Este alcance não está disponível no momento.'; end if;
v_price := round(v_unit * 100)::bigint * p_days;
v_id := gen_random_uuid();
insert into public.promotions (id, house_id, kind, scope, item_type, item_id, days, amount_cents, authorized_at, city_key, state_key, country)
values (v_id, p_house, p_kind, p_scope, v_itype, v_item, p_days, v_price, now(),
case p_scope when 'cidade' then v_city end, case when p_scope in ('cidade', 'estado') then v_state end, case p_scope when 'pais' then v_country end);
v_charge := public.platform_charge_issue(p_house, p_kind, p_scope, v_price, v_today, null,
case p_kind when 'boost' then 'Impulsionamento de "' || left(v_title, 60) || '" por ' else 'Destaque da casa por ' end || p_days || ' dia(s), alcance: ' || p_scope, 'promo:' || v_id, v_id);
update public.promotions set charge_id = v_charge where id = v_id;
return v_charge;
end $$;

-- ============ 8) reembolso ============
create or replace function public.platform_promo_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; pr public.promotions; r public.promo_refunds; v_used int; v_unused int; v_amount bigint; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind not in ('boost', 'highlight') or c.status <> 'paga' then raise exception 'Esta compra não pode ser reembolsada.'; end if;
select * into r from public.promo_refunds where charge_id = p_charge and status in ('pendente', 'concluido');
if found then
if r.status = 'concluido' then raise exception 'Esta compra já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
select * into pr from public.promotions where charge_id = p_charge for update;
if not found or pr.status <> 'ativa' then raise exception 'Esta compra não está ativa.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
v_used := public.promo_blocks_started(pr, p_now);
v_unused := pr.days - v_used;
if v_unused <= 0 then raise exception 'Todos os dias desta compra já começaram.'; end if;
v_amount := public.promo_refund_cents(c.paid_amount_cents, v_unused, pr.days);
if v_amount <= 0 then raise exception 'Nada a reembolsar.'; end if;
-- os dias que não começaram saem antes de pedir o estorno (não dá para usar enquanto devolve)
if v_used = 0 then
update public.promotions set status = 'reembolsada' where id = pr.id;
else
update public.promotions set days = v_used where id = pr.id;
end if;
insert into public.promo_refunds (charge_id, house_id, promotion_id, days_refunded, days_used, prev_days, amount_cents, provider, requested_by)
values (c.id, c.house_id, pr.id, v_unused, v_used, pr.days, v_amount, c.provider, p_by) returning id into v_id;
perform public.promo_rechain(pr.house_id, pr.kind, pr.scope, pr.item_id, p_now);
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', v_amount, 'days_refunded', v_unused, 'resume', false);
end $$;

create or replace function public.platform_promo_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.promo_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.promo_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.promo_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if r.amount_cents >= c.paid_amount_cents and c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
if r.reason = 'sem_vaga' then update public.promotions set status = 'reembolsada' where id = r.promotion_id and status = 'cancelada'; end if;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null and r.reason = 'pedido' then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: devolvemos ' || r.days_refunded || ' dia(s) que não começaram. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

create or replace function public.platform_promo_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.promo_refunds; pr public.promotions; v_owner uuid;
begin
select * into r from public.promo_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
-- falha definitiva do provedor: nos reembolsos automáticos por falta de vaga a rotina tenta de novo
if r.reason = 'sem_vaga' then return; end if;
update public.promo_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
select * into pr from public.promotions where id = r.promotion_id for update;
update public.promotions set status = 'ativa', days = r.prev_days where id = pr.id;
perform public.promo_rechain(pr.house_id, pr.kind, pr.scope, pr.item_id, now());
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso agora. Os seus dias foram mantidos. Tente de novo em instantes ou fale com o suporte.', '/planos');
end if;
end $$;

create or replace function public.platform_promo_refunds_pending(p_older interval default interval '2 minutes')
returns table (refund_id uuid, provider text, ref text, amount_cents bigint)
language sql stable security definer set search_path = public as $$
select r.id, r.provider, c.paid_ref, r.amount_cents from public.promo_refunds r join public.platform_charges c on c.id = r.charge_id
where r.status = 'pendente' and r.created_at < now() - p_older order by r.created_at limit 20;
$$;

-- ============ 9) rotina: encerra, avisa antes do fim e chama quem está na fila ============
create or replace function public.promotions_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_end int := 0; n_notice int := 0; n_wait int := 0; r record; v_limit int; v_taken int; v_owner uuid; v_exp int := 0;
begin
update public.promotions p set status = 'encerrada' where p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_end(p, p_now) <= p_now;
get diagnostics n_end = row_count;
update public.promotions p set status = 'cancelada' where p.status = 'aguardando' and p.created_at < p_now - interval '1 hour'
and not exists (select 1 from public.platform_charges c where c.id = p.charge_id and c.status = 'aberta');
-- aviso 1 dia antes do fim (só quando tem 2+ dias e não há renovação na fila)
for r in select p.id, p.house_id, p.kind, p.item_type, p.item_id, public.promo_eff_end(p, p_now) as ends from public.promotions p
where p.status = 'ativa' and p.pause_started_at is null and p.days >= 2 and p.end_notice_at is null and public.promo_eff_start(p, p_now) <= p_now
and public.promo_eff_end(p, p_now) > p_now and public.promo_eff_end(p, p_now) <= p_now + interval '24 hours'
and not exists (select 1 from public.promotions q where q.id <> p.id and q.house_id = p.house_id and q.kind = p.kind and q.scope = p.scope and q.item_id is not distinct from p.item_id and q.status = 'ativa' and public.promo_eff_start(q, p_now) >= public.promo_eff_end(p, p_now) - interval '1 second') loop
update public.promotions set end_notice_at = p_now where id = r.id;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner,
case r.kind when 'highlight' then 'O destaque da sua casa termina ' else 'Um impulsionamento seu termina ' end || to_char(r.ends at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '. Renove para somar mais dias ao final.',
case r.kind when 'highlight' then '/destaques' else '/impulsionar' end);
end if;
n_notice := n_notice + 1;
end loop;
-- fila de espera: avisa a primeira casa de cada alcance e local que tiver vaga
for r in select distinct on (w.scope, case w.scope when 'cidade' then public.promo_norm(pf.city) when 'estado' then public.promo_norm(pf.state) else upper(coalesce(public.promo_norm(pf.country), 'br')) end, case when w.scope = 'cidade' then public.promo_norm(pf.state) end)
w.house_id, w.scope, h.owner_id, public.promo_norm(pf.city) as city, public.promo_norm(pf.state) as state, upper(coalesce(public.promo_norm(pf.country), 'br')) as country
from public.promo_waitlist w join public.houses h on h.id = w.house_id join public.profiles pf on pf.id = h.owner_id
order by w.scope, case w.scope when 'cidade' then public.promo_norm(pf.city) when 'estado' then public.promo_norm(pf.state) else upper(coalesce(public.promo_norm(pf.country), 'br')) end, case when w.scope = 'cidade' then public.promo_norm(pf.state) end, w.created_at loop
select highlight_slots into v_limit from public.promo_limits where scope = r.scope;
v_taken := public.promo_slots_taken(r.scope, case r.scope when 'cidade' then r.city end, case when r.scope in ('cidade', 'estado') then r.state end, case r.scope when 'pais' then r.country end, r.house_id, p_now);
if v_taken < coalesce(v_limit, 0) then
delete from public.promo_waitlist where house_id = r.house_id and scope = r.scope;
insert into public.notifications (user_id, text, href) values (r.owner_id, 'Abriu uma vaga de destaque no alcance que você esperava. Garanta a sua antes que alguém ocupe.', '/destaques');
n_wait := n_wait + 1;
end if;
end loop;
return jsonb_build_object('ended', n_end, 'notices', n_notice, 'waitlist_called', n_wait);
end $$;

-- ============ 10) leituras ============
-- o que a casa pode ver agora: vagas por alcance e se já está na fila
create or replace function public.promo_availability() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h public.houses; v_city text; v_state text; v_country text; v_out jsonb := '{}'::jsonb; s text; v_limit int; v_taken int; v_mine boolean;
begin
select * into h from public.houses where owner_id = auth.uid() limit 1;
if not found then return jsonb_build_object('has_house', false); end if;
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = h.owner_id;
foreach s in array array['cidade', 'estado', 'pais'] loop
select highlight_slots into v_limit from public.promo_limits where scope = s;
v_taken := public.promo_slots_taken(s, case s when 'cidade' then v_city end, case when s in ('cidade', 'estado') then v_state end, case s when 'pais' then v_country end, h.id, now());
v_mine := public.promo_chain_end(h.id, 'highlight', s, null, now()) is not null;
v_out := v_out || jsonb_build_object(s, jsonb_build_object('limit', v_limit, 'taken', v_taken, 'full', v_taken >= v_limit and not v_mine, 'mine', v_mine,
'waiting', exists (select 1 from public.promo_waitlist w where w.house_id = h.id and w.scope = s),
'located', case s when 'cidade' then v_city is not null and v_state is not null when 'estado' then v_state is not null else true end));
end loop;
return jsonb_build_object('has_house', true, 'scopes', v_out);
end $$;

create or replace function public.promo_waitlist_join(p_scope text) returns void
language plpgsql security definer set search_path = public as $$
declare h public.houses; a jsonb;
begin
if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
if p_scope not in ('cidade', 'estado', 'pais') then raise exception 'Alcance inválido.'; end if;
select * into h from public.houses where owner_id = auth.uid() limit 1;
if not found then raise exception 'Somente a casa entra na lista de espera.'; end if;
a := public.promo_availability() -> 'scopes' -> p_scope;
if coalesce((a ->> 'full')::boolean, false) is not true then raise exception 'Há vaga disponível: você já pode contratar.'; end if;
insert into public.promo_waitlist (house_id, scope) values (h.id, p_scope) on conflict do nothing;
end $$;

create or replace function public.promo_waitlist_leave(p_scope text) returns void
language plpgsql security definer set search_path = public as $$
begin
if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
delete from public.promo_waitlist w using public.houses h where h.owner_id = auth.uid() and w.house_id = h.id and w.scope = p_scope;
end $$;

-- compras da casa: situação, contador (fim exato), dias restantes e reembolso possível
create or replace function public.my_promotions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; v_now timestamptz := now();
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'items', '[]'::jsonb, 'window_days', 7); end if;
return jsonb_build_object('has_house', true, 'window_days', 7, 'items', coalesce((
select jsonb_agg(x order by (x ->> 'sort_at') desc) from (
select jsonb_build_object('id', p.id, 'kind', p.kind, 'scope', p.scope, 'item_type', p.item_type, 'item_id', p.item_id,
'title', case p.kind when 'highlight' then null when 'boost' then coalesce((select s.title from public.services s where s.id = p.item_id), (select e.title from public.events e where e.id = p.item_id)) end,
'days', p.days, 'status', p.status, 'charge_id', p.charge_id, 'paid_cents', c.paid_amount_cents,
'starts_at', public.promo_eff_start(p, v_now), 'ends_at', public.promo_eff_end(p, v_now),
'running', p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_start(p, v_now) <= v_now and public.promo_eff_end(p, v_now) > v_now,
'queued', p.status = 'ativa' and public.promo_eff_start(p, v_now) > v_now,
'paused', p.status = 'ativa' and p.pause_started_at is not null,
'days_left', case when p.status = 'ativa' then p.days - public.promo_blocks_started(p, v_now) end,
'days_used', case when p.status = 'ativa' then public.promo_blocks_started(p, v_now) end,
'refund_cents', case when can_refund then public.promo_refund_cents(c.paid_amount_cents, p.days - public.promo_blocks_started(p, v_now), p.days) end,
'refund_days', case when can_refund then p.days - public.promo_blocks_started(p, v_now) end,
'refund_deadline', c.paid_at + interval '7 days',
'sort_at', coalesce(public.promo_eff_start(p, v_now), p.created_at)) as x
from public.promotions p left join public.platform_charges c on c.id = p.charge_id
cross join lateral (select p.status = 'ativa' and c.status = 'paga' and c.paid_at + interval '7 days' >= v_now and c.paid_amount_cents is not null and c.paid_ref is not null
and p.days - public.promo_blocks_started(p, v_now) > 0 and not exists (select 1 from public.promo_refunds r where r.charge_id = p.charge_id and r.status in ('pendente', 'concluido')) as can_refund) cr
where p.house_id = h and p.status in ('ativa', 'encerrada', 'reembolsada') order by coalesce(p.starts_at, p.created_at) desc limit 40) t), '[]'::jsonb));
end $$;

-- o que aparece para quem está olhando (busca, feed, rituais): só compras rodando agora, no alcance de quem vê
create or replace function public.promotions_visible() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_city text; v_state text; v_country text := 'BR'; v_now timestamptz := now();
begin
if auth.uid() is not null then
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = auth.uid();
v_country := coalesce(v_country, 'BR');
end if;
return coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'scope', p.scope, 'house_id', p.house_id, 'owner_id', (select h2.owner_id from public.houses h2 where h2.id = p.house_id), 'item_type', p.item_type, 'item_id', p.item_id)) from (
select * from public.promotions p where p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_start(p, v_now) <= v_now and public.promo_eff_end(p, v_now) > v_now
and not public.house_is_hidden(p.house_id)
and (case p.scope when 'pais' then p.country is not distinct from v_country
when 'estado' then v_state is not null and p.state_key is not distinct from v_state
else v_city is not null and v_state is not null and p.city_key is not distinct from v_city and p.state_key is not distinct from v_state end)
and (p.kind = 'highlight' or (p.item_type = 'service' and exists (select 1 from public.services s where s.id = p.item_id and s.active and s.listed))
or (p.item_type = 'event' and exists (select 1 from public.events e where e.id = p.item_id and e.status = 'publicado' and e.starts_at > v_now)))
limit 300) p), '[]'::jsonb);
end $$;

-- ============ 11) admin: vagas do destaque (com motivo e auditoria) ============
create or replace function public.admin_set_promo_limit(p_scope text, p_slots int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old int;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_scope not in ('cidade', 'estado', 'pais') then raise exception 'Alcance inválido.'; end if;
if p_slots is null or p_slots not between 1 and 1000 then raise exception 'Informe de 1 a 1000 vagas.'; end if;
if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then raise exception 'Informe o motivo (3 a 300 caracteres).'; end if;
select highlight_slots into v_old from public.promo_limits where scope = p_scope for update;
update public.promo_limits set highlight_slots = p_slots, updated_at = now() where scope = p_scope;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'promo_limit', jsonb_build_object('scope', p_scope, 'slots', v_old), jsonb_build_object('scope', p_scope, 'slots', p_slots, 'reason', btrim(p_reason)));
end $$;

-- ============ 12) permissões ============
revoke all on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds from anon, authenticated;

grant select on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds to authenticated;

revoke all on function public.promotions_guard(), public.promo_refunds_guard(), public.promo_norm(text), public.promo_paused_secs(public.promotions, timestamptz), public.promo_eff_start(public.promotions, timestamptz),
public.promo_eff_end(public.promotions, timestamptz), public.promo_blocks_started(public.promotions, timestamptz), public.promo_refund_cents(bigint, int, int), public.promo_feature_on(text, uuid),
public.promo_house_paused(uuid), public.promo_slots_taken(text, text, text, text, uuid, timestamptz), public.promo_chain_end(uuid, text, text, uuid, timestamptz),
public.promo_rechain(uuid, text, text, uuid, timestamptz), public.promotion_deliver(uuid, timestamptz), public.promotions_on_charge(), public.promotions_sync_pause(),
public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean), public.platform_promo_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_promo_refund_done(uuid, text, timestamptz),
public.platform_promo_refund_fail(uuid, text), public.platform_promo_refunds_pending(interval), public.promotions_tick(timestamptz) from public, anon, authenticated;

grant execute on function public.promo_refund_cents(bigint, int, int), public.promo_feature_on(text, uuid), public.promo_house_paused(uuid), public.promo_slots_taken(text, text, text, text, uuid, timestamptz), public.promo_chain_end(uuid, text, text, uuid, timestamptz),
public.promo_rechain(uuid, text, text, uuid, timestamptz), public.promotion_deliver(uuid, timestamptz), public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean),
public.platform_promo_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_promo_refund_done(uuid, text, timestamptz), public.platform_promo_refund_fail(uuid, text),
public.platform_promo_refunds_pending(interval), public.promotions_tick(timestamptz) to service_role;

revoke all on function public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.my_promotions(), public.admin_set_promo_limit(text, int, text), public.promotions_visible() from public, anon, authenticated;

grant execute on function public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.my_promotions(), public.admin_set_promo_limit(text, int, text) to authenticated, service_role;

grant execute on function public.promotions_visible() to anon, authenticated, service_role;

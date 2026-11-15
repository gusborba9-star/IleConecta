-- 0123 — Desconto de pontualidade no Pix (decisão do proprietário, 15/11/2026): só na mensalidade do plano, só no Pix, até a véspera do vencimento.
-- A fatura guarda o valor cheio, o desconto e o prazo. A página de pagamento do Pix cobra o valor com desconto e a referência guarda o valor pedido;
-- a confirmação aceita somente o valor pedido naquela referência (cheio ou com desconto) e rejeita qualquer outro. Cartão sempre cobra o valor cheio.
-- Percentual, prazo e liga/desliga ficam no painel (billing_config.pix_discount). Sem o campo, o desconto está desligado.

-- ============ 1) Colunas
alter table public.platform_charges add column if not exists pix_discount_cents bigint not null default 0 check (pix_discount_cents >= 0);
alter table public.platform_charges add column if not exists pix_discount_until date;
alter table public.platform_charges drop constraint if exists platform_charges_pix_discount_lt_amount;
alter table public.platform_charges add constraint platform_charges_pix_discount_lt_amount check (pix_discount_cents < amount_cents);
alter table public.platform_charge_refs add column if not exists amount_cents bigint;
alter table public.platform_charge_refs drop constraint if exists platform_charge_refs_amount_pos;
alter table public.platform_charge_refs add constraint platform_charge_refs_amount_pos check (amount_cents is null or amount_cents > 0);

-- ============ 2) Configuração válida: aceita o campo opcional pix_discount {enabled, pct 1..20, ends_days_before 0..14}
create or replace function public.billing_config_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; x jsonb; kinds text[] := array['plan','extra_seat','credit_pack','highlight','boost']; meths text[] := array['card','card_recurring','pix'];
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a where a not in ('total_block_days', 'pix_discount')) is distinct from array['enabled','methods','notice_days','provider','tolerance_business_days'] then return false; end if;
if m ? 'total_block_days' and (coalesce(jsonb_typeof(m -> 'total_block_days'), '') <> 'number' or (m ->> 'total_block_days') !~ '^[0-9]{1,2}$' or (m ->> 'total_block_days')::int not between 7 and 90) then return false; end if;
if m ? 'pix_discount' then
v := m -> 'pix_discount';
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from array['enabled','ends_days_before','pct'] then return false; end if;
if coalesce(jsonb_typeof(v -> 'enabled'), '') <> 'boolean' then return false; end if;
if coalesce(jsonb_typeof(v -> 'pct'), '') <> 'number' or (v ->> 'pct') !~ '^[0-9]{1,2}$' or (v ->> 'pct')::int not between 1 and 20 then return false; end if;
if coalesce(jsonb_typeof(v -> 'ends_days_before'), '') <> 'number' or (v ->> 'ends_days_before') !~ '^[0-9]{1,2}$' or (v ->> 'ends_days_before')::int not between 0 and 14 then return false; end if;
end if;
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

-- ============ 3) Quanto de desconto e até quando (só com o desconto ligado)
create or replace function public.platform_pix_discount(p_amount bigint, p_due date, out cents bigint, out until_on date)
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config() -> 'pix_discount'; pct int; ends int; d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
cents := 0; until_on := null;
if cfg is null or coalesce((cfg ->> 'enabled')::boolean, false) is not true or p_amount is null or p_due is null then return; end if;
pct := (cfg ->> 'pct')::int; ends := (cfg ->> 'ends_days_before')::int;
if (p_due - ends) < d then return; end if;
cents := round(p_amount * pct / 100.0)::bigint;
if cents < 1 or p_amount - cents < 100 then cents := 0; return; end if;
until_on := p_due - ends;
end $$;
revoke all on function public.platform_pix_discount(bigint, date) from public, anon, authenticated;

-- ============ 4) Emitir a fatura: a mensalidade do plano guarda o desconto do Pix (e a notificação já o cita)
create or replace function public.platform_charge_issue(p_house uuid, p_kind text, p_item_key text, p_amount bigint, p_due date, p_period_start date, p_description text, p_idem text, p_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; ex public.platform_charges; disc record;
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
if p_kind = 'plan' and p_description = 'Mensalidade do plano' then
select * into disc from public.platform_pix_discount(p_amount, p_due);
if disc.cents > 0 then update public.platform_charges set pix_discount_cents = disc.cents, pix_discount_until = disc.until_on where id = v_id; end if;
end if;
perform public.platform_billing_notice(v_id, 'fatura_disponivel');
return v_id;
end $$;

-- ============ 5) Valor a pagar agora, por meio (a função de cobrança consulta aqui; o valor nunca vem de fora)
create or replace function public.platform_charge_payable(p_charge uuid, p_method text, p_now timestamptz default now())
returns bigint language plpgsql stable security definer set search_path = public as $$
declare c public.platform_charges; d date := (p_now at time zone 'America/Sao_Paulo')::date;
begin
select * into c from public.platform_charges where id = p_charge;
if not found then raise exception 'Fatura inexistente.'; end if;
if p_method = 'pix' and c.status in ('aberta','vencida') and c.pix_discount_cents > 0 and c.pix_discount_until is not null and d <= c.pix_discount_until then
return c.amount_cents - c.pix_discount_cents;
end if;
return c.amount_cents;
end $$;
revoke all on function public.platform_charge_payable(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_charge_payable(uuid, text, timestamptz) to service_role;

-- ============ 6) Guardar a página de pagamento junto com o valor pedido (o desconto só vale para Pix, dentro do prazo)
drop function if exists public.platform_charge_attach(uuid, text, text, text, text);
create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text, p_amount bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; other uuid; v_amount bigint;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida') then raise exception 'Fatura não aceita nova página de pagamento agora.'; end if;
v_amount := coalesce(p_amount, c.amount_cents);
if v_amount <> c.amount_cents then
if not (p_method = 'pix' and c.pix_discount_cents > 0 and v_amount = c.amount_cents - c.pix_discount_cents and c.pix_discount_until is not null and (now() at time zone 'America/Sao_Paulo')::date <= c.pix_discount_until) then
raise exception 'valor_invalido';
end if;
end if;
other := public.platform_charge_of_ref(p_provider, p_ref);
if other is not null and other <> p_charge then raise exception 'referencia_de_outra_fatura'; end if;
insert into public.platform_charge_refs (charge_id, provider, ref, amount_cents) values (p_charge, p_provider, p_ref, v_amount) on conflict (provider, ref) do nothing;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;
revoke all on function public.platform_charge_attach(uuid, text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.platform_charge_attach(uuid, text, text, text, text, bigint) to service_role;

-- ============ 7) Valor esperado de uma referência (a confirmação e a função de cobrança usam o mesmo)
create or replace function public.platform_ref_expected(p_provider text, p_ref text)
returns bigint language sql stable security definer set search_path = public as $$
select coalesce((select r.amount_cents from public.platform_charge_refs r where r.provider = p_provider and r.ref = p_ref),
(select c.amount_cents from public.platform_charges c where c.id = public.platform_charge_of_ref(p_provider, p_ref)));
$$;
revoke all on function public.platform_ref_expected(text, text) from public, anon, authenticated;
grant execute on function public.platform_ref_expected(text, text) to service_role;

-- ============ 8) Confirmação: aceita só o valor pedido naquela referência
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
if p_paid_cents is distinct from public.platform_ref_expected(p_provider, p_ref) then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > p_paid_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents, paid_ref = p_ref where id = c.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'receita', p_paid_cents);
if p_fee_cents is not null and p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
if c.kind = 'credit_pack' then
insert into public.ai_credit_packs (house_id, charge_id, size, remaining, purchased_at, expires_at)
values (c.house_id, c.id, (regexp_replace(c.item_key, '^p', ''))::int, (regexp_replace(c.item_key, '^p', ''))::int, now(), now() + interval '3 months') on conflict (charge_id) do nothing;
end if;
if c.kind in ('boost','highlight') and c.ref_id is not null then
update public.boosts set paid = true where id = c.ref_id and house_id = c.house_id;
end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return jsonb_build_object('charge', c.id, 'already', false, 'house', c.house_id);
end $$;

-- ============ 9) Aviso da fatura cita o desconto (só quem não está no cartão automático); último dia do desconto na véspera
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date; f public.house_card_on_file; auto boolean := false; promo text := ''; last_day text := ''; d date := (now() at time zone 'America/Sao_Paulo')::date; pct int;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
-- fatura de reativação, assinatura ou upgrade é pedida pela própria casa na hora: sem lembretes de fatura
if c.idempotency_key ~ '^(reativacao|assinatura|upgrade):' then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
select * into f from public.house_card_on_file where house_id = c.house_id;
auto := found and f.auto_enabled and f.method_ref is not null and c.kind in ('plan', 'extra_seat') and c.due_date >= f.saved_on and public.billing_auto_card_enabled()
and not exists (select 1 from public.platform_auto_attempts t where t.charge_id = c.id and t.outcome in ('recusada', 'exige_acao'));
if not auto and c.pix_discount_cents > 0 and c.pix_discount_until is not null and c.pix_discount_until >= d and c.status in ('aberta','vencida') then
pct := round(100.0 * c.pix_discount_cents / c.amount_cents)::int;
promo := ' Pague com Pix até ' || to_char(c.pix_discount_until, 'DD/MM') || ' e ganhe ' || pct || '% de desconto.';
if c.pix_discount_until = d then last_day := ' Hoje é o último dia para pagar com Pix com ' || pct || '% de desconto.'; end if;
end if;
msg := case p_stage
when 'fatura_disponivel' then case when auto then 'Sua fatura da plataforma vence em ' || to_char(c.due_date, 'DD/MM') || ' e será cobrada automaticamente no cartão final ' || coalesce(f.last4, '') || ' nesse dia. Você pode pagar antes ou trocar o cartão em Planos.'
else 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.' || promo end
when 'vespera' then case when auto then 'Amanhã (' || to_char(c.due_date, 'DD/MM') || ') cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '. Confira se o cartão está dentro da validade e com limite.'
else 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').' || last_day end
when 'dia_vencimento' then case when auto then 'Hoje cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '.' else 'Sua fatura da plataforma vence hoje.' end
when 'suspensao' then 'Sua casa está com a suspensão parcial: sem vendas novas, campanhas, destaque, impulsionamento e assistente. Pague a fatura para voltar ao normal.'
when 'total_em_breve' then 'Atenção: se a fatura da plataforma continuar em aberto, sua casa será bloqueada por completo em ' || to_char(tol_end + public.billing_total_days() + 1, 'DD/MM') || '. Pague para evitar.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

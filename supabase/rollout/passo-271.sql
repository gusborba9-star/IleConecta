-- PASSO 271: 0126_cpf_cnpj_da_casa — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) Administração: consulta com motivo (registrada) e correção com motivo
create or replace function public.admin_house_tax_id(p_house uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t public.house_tax_ids; d text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_reason is null or char_length(btrim(p_reason)) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
select * into t from public.house_tax_ids where house_id = p_house;
if not found then return jsonb_build_object('set', false); end if;
d := pgp_sym_decrypt(t.doc_enc, public.tax_id_key());
insert into public.tax_id_access_log (admin_id, house_id, action, reason) values (auth.uid(), p_house, 'ver', left(btrim(p_reason), 300));
return jsonb_build_object('set', true, 'kind', t.kind, 'doc', public.tax_id_format(d), 'set_at', t.set_at);
end $$;

create or replace function public.admin_house_tax_id_set(p_house uuid, p_doc text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_reason is null or char_length(btrim(p_reason)) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
k := public.tax_id_store(p_house, p_doc, auth.uid(), true);
insert into public.tax_id_access_log (admin_id, house_id, action, reason) values (auth.uid(), p_house, 'corrigir', left(btrim(p_reason), 300));
return jsonb_build_object('kind', k);
end $$;

revoke all on function public.admin_house_tax_id(uuid, text), public.admin_house_tax_id_set(uuid, text, text) from public, anon, authenticated;

grant execute on function public.admin_house_tax_id(uuid, text), public.admin_house_tax_id_set(uuid, text, text) to authenticated;

-- ============ 6) Contratar plano pago, reativar, subir de plano e comprar vaga passam a exigir o documento
create or replace function public.platform_subscribe_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_amt bigint; v_open uuid; v_n int; v_id uuid;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then raise exception 'A cobrança da plataforma ainda não está ativa.'; end if;
perform 1 from public.houses where id = p_house for update;
if not found then raise exception 'Casa inexistente.'; end if;
if p_plan is null or p_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Escolha um plano com mensalidade.'; end if;
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then raise exception 'A assinatura está cancelada. Use a reativação da casa.'; end if;
if exists (select 1 from public.house_billing_plan where house_id = p_house and active) then raise exception 'A casa já tem assinatura ativa. Use a troca de plano.'; end if;
v_amt := public.platform_plan_monthly_cents(p_plan, v_day);
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade na tabela. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida') and amount_cents = v_amt and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
if exists (select 1 from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status = 'em_processamento') then raise exception 'Há um pagamento em processamento. Aguarde a confirmação.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%';
perform public.platform_require_tax_id(p_house);
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, v_amt, v_day, null, 'Assinatura do plano', 'assinatura:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_reactivation_issue(p_house uuid, p_plan text default null, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan text; v_amt bigint; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_open uuid; v_n int; v_id uuid; v_pricing jsonb; v_debt bigint;
begin
perform 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null for update;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
v_debt := public.platform_house_overdue_cents(p_house, v_day);
if v_debt > 0 then raise exception 'Pague a fatura vencida de % antes de reativar a conta.', public.billing_money_br(v_debt); end if;
select coalesce(p_plan, plan::text) into v_plan from public.houses where id = p_house;
if v_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Plano inválido.'; end if;
select value into v_pricing from public.platform_settings where key = 'pricing';
v_amt := case when (v_pricing -> 'plans' -> v_plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((v_pricing -> 'plans' -> v_plan ->> 'monthly')::numeric * 100)::bigint end;
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade para reativar. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida', 'em_processamento') and amount_cents = v_amt and item_key = 'plan:' || v_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%';
perform public.platform_require_tax_id(p_house);
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || v_plan, v_amt, v_day, null, 'Reativação do plano', 'reativacao:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reativacao_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_upgrade_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_upgrade_quote(p_house, p_plan, v_day);
perform public.platform_require_tax_id(p_house);
select id into v_open from public.platform_charges where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, (q ->> 'amount_cents')::bigint, v_day, null, 'Upgrade do plano (diferença proporcional)', 'upgrade:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_solicitado', v_id, 'processado', p_house::text);
return v_id;
end $$;

-- PASSO 202: 0108_contratacao_de_plano_no_app — parte 3 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
drop trigger if exists trg_platform_house_upgraded on public.platform_charges;

create trigger trg_platform_house_upgraded after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_house_upgraded_by_payment();

-- ============ 5) primeira assinatura (casa sem assinatura ativa): vence no dia do pagamento ============
create or replace function public.platform_subscribe_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_amt bigint; v_open uuid; v_n int; v_id uuid;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then raise exception 'A cobrança da plataforma ainda não está ativa.'; end if;
perform 1 from public.houses where id = p_house for update;
if not found then raise exception 'Casa inexistente.'; end if;
if p_plan is null or p_plan not in ('intermediario', 'maximo') then raise exception 'Escolha um plano com mensalidade.'; end if;
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then raise exception 'A assinatura está cancelada. Use a reativação da casa.'; end if;
if exists (select 1 from public.house_billing_plan where house_id = p_house and active) then raise exception 'A casa já tem assinatura ativa. Use a troca de plano.'; end if;
v_amt := public.platform_plan_monthly_cents(p_plan, v_day);
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade na tabela. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida') and amount_cents = v_amt and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
if exists (select 1 from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status = 'em_processamento') then raise exception 'Há um pagamento em processamento. Aguarde a confirmação.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, v_amt, v_day, null, 'Assinatura do plano', 'assinatura:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_house_subscribed_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date := (coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo')::date; v_plan text := substring(new.item_key from 6); v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'assinatura:%' then return new; end if;
if v_plan not in ('intermediario', 'maximo') or exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) or exists (select 1 from public.house_billing_state where house_id = new.house_id and cancelled_at is not null) then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_paga_sem_efeito', new.id, 'rejeitado', new.house_id::text);
return new;
end if;
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = v_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = new.house_id;
perform set_config('app.admin_plan', 'off', true);
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (new.house_id, least(extract(day from v_day)::int, 28), v_day, true)
on conflict (house_id) do update set active = true, billing_day = excluded.billing_day, started_on = excluded.started_on, pending_plan = null, pending_plan_on = null, updated_at = now();
perform public.platform_house_billing_recompute(new.house_id);
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_ativada', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: seu plano está ativo e a cobrança mensal passa a vencer neste mesmo dia. A cobrança automática no cartão fica desligada até você ligar em Planos.', '/planos');
end if;
return new;
end $$;

drop trigger if exists trg_platform_house_subscribed on public.platform_charges;

create trigger trg_platform_house_subscribed after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_house_subscribed_by_payment();

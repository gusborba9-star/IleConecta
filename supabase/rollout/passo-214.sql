-- PASSO 214: 0111_plano_gratis — parte 5 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_house_subscribed_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date := (coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo')::date; v_plan text := substring(new.item_key from 6); v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'assinatura:%' then return new; end if;
if v_plan not in ('base', 'intermediario', 'maximo') or exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) or exists (select 1 from public.house_billing_state where house_id = new.house_id and cancelled_at is not null) then
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

create or replace function public.platform_plan_pending_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0; v_owner uuid;
begin
for r in select house_id, pending_plan from public.house_billing_plan where active and pending_plan is not null and pending_plan_on <= d order by pending_plan_on loop
begin
if r.pending_plan = 'gratis' then
update public.platform_charges set status = 'cancelada' where house_id = r.house_id and kind in ('plan', 'extra_seat') and status = 'aberta';
perform public.platform_house_to_free(r.house_id, p_now);
else
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = r.pending_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = r.house_id;
perform set_config('app.admin_plan', 'off', true);
update public.house_billing_plan set pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = r.house_id;
end if;
perform public.platform_house_billing_recompute(r.house_id, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'plano_reduzido', 'processado', r.house_id::text || ':' || r.pending_plan);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, case when r.pending_plan = 'gratis' then 'Sua casa voltou ao plano Grátis, como você pediu. Nenhuma nova mensalidade será cobrada. Para voltar a um plano pago, escolha em Planos.' else 'Seu plano foi alterado na renovação, como você pediu.' end, '/planos');
end if;
n := n + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_reducao_plano', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

create or replace function public.my_plan_change_schedule(p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; bp public.house_billing_plan; v_reason text; c date;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then raise exception 'Só a casa pode trocar de plano.'; end if;
select * into bp from public.house_billing_plan where house_id = h.id and active for update;
v_reason := public.platform_plan_change_block_reason(h.id, d);
if v_reason is not null then raise exception '%', v_reason; end if;
if p_plan is null or p_plan not in ('gratis', 'base', 'intermediario') or public.platform_plan_rank(p_plan) >= public.platform_plan_rank(h.plan::text) then raise exception 'Escolha um plano abaixo do atual.'; end if;
c := date_trunc('month', d)::date + (bp.billing_day - 1);
if c <= d then c := (date_trunc('month', d) + interval '1 month')::date + (bp.billing_day - 1); end if;
if exists (select 1 from public.platform_charges where house_id = h.id and kind = 'plan' and idempotency_key = 'plan:' || h.id || ':' || c and status <> 'cancelada') then c := (c + interval '1 month')::date; end if;
update public.house_billing_plan set pending_plan = p_plan, pending_plan_on = c, updated_at = now() where house_id = h.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_plano_agendada', 'processado', h.id::text || ':' || p_plan || ':' || c);
insert into public.notifications (user_id, text, href) values (me, 'Troca de plano agendada: você mantém o plano atual até ' || to_char(c, 'DD/MM/YYYY') || ' e, nessa renovação, passa para o plano escolhido. Até lá, pode desfazer em Planos.', '/planos');
return jsonb_build_object('plan', p_plan, 'effective_on', c);
end $$;

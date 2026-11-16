-- PASSO 264: 0125_vaga_extra_de_equipe — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0125 — Vaga extra de equipe contratada no app (decisões do proprietário, 15/11/2026).
-- Contratar: paga na hora só os dias que faltam do ciclo (valor proporcional); a vaga é liberada somente depois do pagamento confirmado
-- e entra na fatura mensal de vagas a partir da renovação seguinte. Reduzir: a vaga continua até o fim do ciclo pago e some da fatura seguinte,
-- sem devolução. Reembolso de 7 dias vale só para o plano. A fatura da vaga usa a chave 'upgrade:seat:...' (pedida pela própria casa na hora):
-- sem lembretes, sem cartão automático e nunca vira atraso, como o upgrade de plano.

-- ============ 1) Redução agendada das vagas extras
alter table public.house_extra_seats add column if not exists release_to int check (release_to between 0 and 20);

alter table public.house_extra_seats add column if not exists release_on date;

alter table public.house_extra_seats drop constraint if exists house_extra_seats_release_pair;

alter table public.house_extra_seats add constraint house_extra_seats_release_pair check ((release_to is null) = (release_on is null));

-- ============ 2) O upgrade de plano passa a ignorar a fatura de vaga (mesmo prefixo de chave)
create or replace function public.platform_upgrade_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_upgrade_quote(p_house, p_plan, v_day);
select id into v_open from public.platform_charges where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, (q ->> 'amount_cents')::bigint, v_day, null, 'Upgrade do plano (diferença proporcional)', 'upgrade:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_solicitado', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_house_upgraded_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text := substring(new.item_key from 6); v_cur text; v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.kind <> 'plan' or new.idempotency_key not like 'upgrade:%' then return new; end if;
select plan::text into v_cur from public.houses where id = new.house_id;
if v_cur is null or v_plan not in ('intermediario', 'maximo') or public.platform_plan_rank(v_plan) <= public.platform_plan_rank(v_cur) or not exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_pago_sem_efeito', new.id, 'rejeitado', new.house_id::text);
return new;
end if;
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = v_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = new.house_id;
perform set_config('app.admin_plan', 'off', true);
update public.house_billing_plan set pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = new.house_id;
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_aplicado', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: seu plano foi atualizado e os novos recursos já estão liberados. O vencimento mensal continua no mesmo dia.', '/planos');
end if;
return new;
end $$;

-- ============ 3) Quanto custa a vaga agora (proporcional aos dias que faltam) e por que não dá (erro com a razão)
create or replace function public.platform_seat_quote(p_house uuid, p_today date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h public.houses; bp public.house_billing_plan; s public.house_extra_seats; v_reason text; c0 date; cstart date; cend date; v_total int; v_left int; v_month bigint; v_amt bigint; v_prices jsonb;
begin
select * into h from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
v_reason := public.platform_plan_change_block_reason(p_house, p_today);
if v_reason is not null then raise exception '%', replace(v_reason, 'trocar de plano', 'contratar a vaga'); end if;
select * into s from public.house_extra_seats where house_id = p_house;
if found and s.release_on is not null then raise exception 'Há uma redução de vagas agendada. Desfaça a redução antes de contratar outra vaga.'; end if;
if coalesce(s.seats, 0) >= 20 then raise exception 'A casa já está no limite de 20 vagas extras.'; end if;
v_prices := public.platform_billing_prices();
if (v_prices -> 'extra_seat' ->> h.plan::text) !~ '^[0-9]+$' then raise exception 'Este plano não tem vaga adicional na tabela.'; end if;
v_month := (v_prices -> 'extra_seat' ->> h.plan::text)::bigint;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind = 'extra_seat' and c.idempotency_key like 'extra_seat:%'
  and ((c.status in ('aberta', 'em_processamento') and c.period_start >= p_today) or (c.status = 'paga' and c.period_start > p_today))) then
raise exception 'A fatura de vagas da próxima renovação já foi gerada. A contratação de uma nova vaga fica disponível depois do vencimento dela.';
end if;
select * into bp from public.house_billing_plan where house_id = p_house and active;
c0 := date_trunc('month', p_today)::date + (bp.billing_day - 1);
if c0 <= p_today then
cstart := c0; cend := (date_trunc('month', p_today) + interval '1 month')::date + (bp.billing_day - 1);
else
cend := c0; cstart := (date_trunc('month', p_today) - interval '1 month')::date + (bp.billing_day - 1);
end if;
v_total := cend - cstart; v_left := cend - p_today;
v_amt := round(v_month::numeric * v_left / v_total)::bigint;
if v_amt < 100 then raise exception 'A renovação está muito próxima e o valor fica abaixo do mínimo de cobrança. A contratação fica disponível depois da renovação.'; end if;
return jsonb_build_object('amount_cents', v_amt, 'monthly_cents', v_month, 'days_left', v_left, 'days_total', v_total, 'cycle_end', cend);
end $$;

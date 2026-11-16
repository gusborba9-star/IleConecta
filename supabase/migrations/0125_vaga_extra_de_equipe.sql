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

-- ============ 4) Emitir a fatura da vaga (só o servidor; repetir reaproveita a fatura aberta)
create or replace function public.platform_seat_issue(p_house uuid, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_seat_quote(p_house, v_day);
select id into v_open from public.platform_charges where house_id = p_house and kind = 'extra_seat' and idempotency_key like 'upgrade:seat:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind = 'extra_seat' and idempotency_key like 'upgrade:seat:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'upgrade:seat:%';
v_id := public.platform_charge_issue(p_house, 'extra_seat', 'extra_seat', (q ->> 'amount_cents')::bigint, v_day, null, 'Vaga adicional de equipe (valor proporcional)', 'upgrade:seat:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

-- ============ 5) Pagamento confirmado: a vaga é liberada (uma vez, só na virada para paga)
create or replace function public.platform_seat_bought_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_seats int;
begin
if new.status <> 'paga' or old.status = 'paga' or new.kind <> 'extra_seat' or new.idempotency_key not like 'upgrade:seat:%' then return new; end if;
select seats into v_seats from public.house_extra_seats where house_id = new.house_id for update;
if coalesce(v_seats, 0) >= 20 or not exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_paga_sem_efeito', new.id, 'rejeitado', new.house_id::text);
return new;
end if;
insert into public.house_extra_seats (house_id, seats) values (new.house_id, 1)
on conflict (house_id) do update set seats = public.house_extra_seats.seats + 1,
  release_to = case when public.house_extra_seats.release_to is null then null else least(public.house_extra_seats.release_to + 1, 20) end;
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_liberada', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: a vaga extra de equipe já está liberada. Ela passa a entrar na fatura mensal de vagas a partir da próxima renovação.', '/equipe');
end if;
return new;
end $$;

drop trigger if exists trg_platform_seat_bought on public.platform_charges;

create trigger trg_platform_seat_bought after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_seat_bought_by_payment();

-- vaga paga que depois é estornada pelo provedor não some sozinha: fica registrado para a administração decidir
create or replace function public.platform_seat_refunded_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if new.kind = 'extra_seat' and new.idempotency_key like 'upgrade:seat:%' and new.status = 'estornada' and old.status is distinct from 'estornada' then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_estornada_revisar', new.id, 'processado', new.house_id::text);
end if;
return new;
end $$;

drop trigger if exists trg_platform_seat_refunded on public.platform_charges;

create trigger trg_platform_seat_refunded after update of status on public.platform_charges
for each row when (new.status = 'estornada' and old.status is distinct from 'estornada')
execute function public.platform_seat_refunded_flag();

-- ============ 6) Reduzir vagas: vale até a renovação, sai da fatura seguinte, sem devolução
create or replace function public.platform_seat_release_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0; v_owner uuid;
begin
for r in select house_id, seats, release_to from public.house_extra_seats where release_on is not null and release_on <= d order by release_on loop
begin
update public.house_extra_seats set seats = least(seats, release_to), release_to = null, release_on = null where house_id = r.house_id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vagas_reduzidas', 'processado', r.house_id::text || ':' || r.seats || '>' || r.release_to);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'As vagas extras de equipe foram reduzidas na renovação, como você pediu.', '/equipe');
end if;
n := n + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_reducao_vagas', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
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
if exists (select 1 from public.platform_charges where house_id = h.id and kind = 'extra_seat' and idempotency_key = 'extra_seat:' || h.id || ':' || c and status <> 'cancelada') then c := (c + interval '1 month')::date; end if;
update public.house_extra_seats set release_to = p_keep, release_on = c where house_id = h.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_vagas_agendada', 'processado', h.id::text || ':' || p_keep || ':' || c);
return jsonb_build_object('keep', p_keep, 'effective_on', c);
end $$;

create or replace function public.my_seat_release_undo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; s public.house_extra_seats;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then raise exception 'Só a casa pode desfazer a redução.'; end if;
select * into s from public.house_extra_seats where house_id = h.id for update;
if not found or s.release_on is null then raise exception 'Não há redução agendada.'; end if;
if exists (select 1 from public.platform_charges where house_id = h.id and kind = 'extra_seat' and idempotency_key like 'extra_seat:%' and status <> 'cancelada' and period_start >= s.release_on) then
raise exception 'A fatura de vagas da próxima renovação já foi gerada com a redução. Depois do vencimento, contrate as vagas de novo.';
end if;
update public.house_extra_seats set release_to = null, release_on = null where house_id = h.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_vagas_desfeita', 'processado', h.id::text);
return jsonb_build_object('ok', true);
end $$;

-- o que a casa vê em Equipe: vagas, uso, valor da próxima vaga (ou o motivo de não estar disponível) e redução agendada
create or replace function public.my_seat_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; s public.house_extra_seats; q jsonb; blk text; v_sub boolean;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then return jsonb_build_object('has_house', false); end if;
select * into s from public.house_extra_seats where house_id = h.id;
select exists (select 1 from public.house_billing_plan where house_id = h.id and active) into v_sub;
if v_sub then
begin
q := public.platform_seat_quote(h.id, d);
exception when others then
blk := sqlerrm;
end;
else
blk := 'A casa não tem assinatura ativa.';
end if;
return jsonb_build_object('has_house', true, 'subscribed', v_sub, 'plan', h.plan::text, 'included', public.plan_cap_int(h.plan::text, 'included_seats'), 'extra', coalesce(s.seats, 0),
'in_use', (select count(*) from public.house_staff where house_id = h.id), 'quote', q, 'blocked', blk, 'release_to', s.release_to, 'release_on', s.release_on);
end $$;

-- a administração, ao ajustar as vagas na mão, cancela a redução agendada
create or replace function public.admin_set_house_seats(p_house uuid, p_seats int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_seats < 0 or p_seats > 20 then raise exception 'invalid_value'; end if;
  insert into public.house_extra_seats (house_id, seats) values (p_house, p_seats)
    on conflict (house_id) do update set seats = excluded.seats, release_to = null, release_on = null;
end $$;

-- ============ 7) A rotina diária aplica a redução na renovação e cobra as vagas que valem para o ciclo
create or replace function public.platform_billing_tick(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare eff text; cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; nd int; tol int; tdays int := public.billing_total_days(); nday int := (public.platform_billing_config() ->> 'notice_days')::int; total_on date; pricing jsonb; prices jsonb;
h record; c record; m int; cand date; due date; amt bigint; seats int; issued int := 0; late int := 0; notices int := 0; houses int := 0; tol_end date;
begin
if coalesce((cfg ->> 'enabled')::boolean, false) is not true then return jsonb_build_object('skipped', 'cobranca_desligada'); end if;
nd := (cfg ->> 'notice_days')::int; tol := (cfg ->> 'tolerance_business_days')::int;
select value into pricing from public.platform_settings where key = 'pricing';
prices := public.platform_billing_prices();
perform public.platform_plan_pending_apply_due(p_now);
perform public.platform_seat_release_apply_due(p_now);
for h in select p.house_id, p.billing_day, p.started_on, hs.plan::text as plan, p.pending_plan, p.pending_plan_on from public.house_billing_plan p join public.houses hs on hs.id = p.house_id where p.active and not exists (select 1 from public.house_billing_state bs where bs.house_id = p.house_id and bs.cancel_at is not null) loop
begin
for m in -1..1 loop
cand := (date_trunc('month', d)::date + make_interval(months => m))::date + (h.billing_day - 1);
continue when cand - nd < h.started_on or cand < d - 31;
due := greatest(cand, d + nd);
eff := case when h.pending_plan is not null and cand >= h.pending_plan_on then h.pending_plan else h.plan end;
amt := public.platform_plan_monthly_cents(eff, due);
if amt is not null and cand - nd <= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'plan:' || h.house_id || ':' || cand) then
perform public.platform_charge_issue(h.house_id, 'plan', 'plan:' || eff, amt, due, cand, 'Mensalidade do plano', 'plan:' || h.house_id || ':' || cand);
issued := issued + 1;
end if;
exception when unique_violation then null;
end;
end if;
select coalesce(case when s.release_on is not null and cand >= s.release_on then s.release_to else s.seats end, 0) into seats from public.house_extra_seats s where s.house_id = h.house_id;
amt := case when coalesce(seats, 0) > 0 and (prices -> 'extra_seat' ->> eff) ~ '^[0-9]+$' then seats * (prices -> 'extra_seat' ->> eff)::bigint end;
if amt is not null and cand - nd <= d and cand >= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'extra_seat:' || h.house_id || ':' || cand)
and not exists (select 1 from public.platform_charges q where q.house_id = h.house_id and q.idempotency_key like 'upgrade:seat:%' and q.status in ('aberta', 'em_processamento', 'paga') and q.due_date >= cand) then
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
update public.platform_charges set status = 'cancelada' where (kind not in ('plan','extra_seat') or idempotency_key ~ '^(assinatura|upgrade):') and status in ('aberta','vencida') and created_at < p_now - interval '2 days';
update public.platform_charges set status = 'vencida' where status = 'aberta' and due_date < d and kind in ('plan','extra_seat') and idempotency_key !~ '^(assinatura|upgrade):';
get diagnostics late = row_count;
for c in select id, due_date from public.platform_charges where status in ('aberta','vencida') and kind in ('plan','extra_seat') loop
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

-- ============ 8) permissões
revoke all on function public.platform_seat_quote(uuid, date), public.platform_seat_issue(uuid, timestamptz), public.platform_seat_bought_by_payment(), public.platform_seat_refunded_flag(),
  public.platform_seat_release_apply_due(timestamptz), public.my_seat_release_schedule(int), public.my_seat_release_undo(), public.my_seat_status() from public, anon, authenticated;
grant execute on function public.platform_seat_issue(uuid, timestamptz), public.platform_seat_release_apply_due(timestamptz) to service_role;
grant execute on function public.my_seat_release_schedule(int), public.my_seat_release_undo(), public.my_seat_status() to authenticated, service_role;
revoke all on function public.admin_set_house_seats(uuid, int) from public, anon;
grant execute on function public.admin_set_house_seats(uuid, int) to authenticated;

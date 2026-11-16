-- PASSO 266: 0125_vaga_extra_de_equipe — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

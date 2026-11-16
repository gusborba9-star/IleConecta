-- PASSO 265: 0125_vaga_extra_de_equipe — parte 2 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

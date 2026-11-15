-- PASSO 226: 0114_destaque_e_impulsionamento — parte 6 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

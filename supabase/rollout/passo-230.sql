-- PASSO 230: 0114_destaque_e_impulsionamento — parte 10 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

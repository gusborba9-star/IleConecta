-- PASSO 224: 0114_destaque_e_impulsionamento — parte 4 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) auxiliares de tempo (puros: recebem o "agora", então são testáveis no tempo) ============
create or replace function public.promo_norm(t text) returns text
language sql immutable set search_path = public as $$
select nullif(btrim(translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '');
$$;

create or replace function public.promo_paused_secs(p public.promotions, p_now timestamptz) returns numeric
language sql immutable set search_path = public as $$
select p.paused_seconds + coalesce(greatest(extract(epoch from p_now - p.pause_started_at), 0), 0);
$$;

create or replace function public.promo_eff_start(p public.promotions, p_now timestamptz) returns timestamptz
language sql immutable set search_path = public as $$
select p.starts_at + make_interval(secs => public.promo_paused_secs(p, p_now)::double precision);
$$;

create or replace function public.promo_eff_end(p public.promotions, p_now timestamptz) returns timestamptz
language sql immutable set search_path = public as $$
select public.promo_eff_start(p, p_now) + p.days * interval '24 hours';
$$;

-- blocos de 24 horas já iniciados (o 1º conta na entrega). Ainda não começou = 0. Nunca passa do total de dias.
create or replace function public.promo_blocks_started(p public.promotions, p_now timestamptz) returns int
language sql immutable set search_path = public as $$
select case when p.starts_at is null or p_now < public.promo_eff_start(p, p_now) then 0
else least(p.days, floor(extract(epoch from p_now - public.promo_eff_start(p, p_now)) / 86400)::int + 1) end;
$$;

-- valor a devolver: proporcional, inteiro em centavos, meio centavo para cima, nunca acima do pago
create or replace function public.promo_refund_cents(p_paid bigint, p_unused int, p_days int) returns bigint
language sql immutable set search_path = public as $$
select least(p_paid, (p_paid * p_unused * 2 + p_days) / (p_days * 2));
$$;

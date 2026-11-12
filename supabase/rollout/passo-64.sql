-- PASSO 64: 0085_matriz_de_planos — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) leitura pelo banco ============
create or replace function public.plan_matrix() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select s.value from public.platform_settings s where s.key = 'plan_matrix' and public.plan_matrix_ok(s.value)), public.plan_matrix_default());
$$;

create or replace function public.plan_cap_int(p_plan text, p_key text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((public.plan_matrix() #>> array['caps', p_plan, p_key])::int, 0);
$$;

create or replace function public.plan_cap_bool(p_plan text, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.plan_matrix() #>> array['caps', p_plan, p_key])::boolean, false);
$$;

-- ============ 4) as travas passam a ler da matriz ============
create or replace function public.campaign_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan; n int; lim int;
begin
  select plan into p from public.houses where id = new.house_id;
  lim := public.plan_cap_int(p::text, 'campaign_links');
  if lim <= 0 then raise exception 'Os links de divulgação não estão disponíveis no seu plano.'; end if;
  select count(*) into n from public.house_campaigns where house_id = new.house_id;
  if n >= lim then
    raise exception 'Seu plano permite até % links de divulgação.', lim;
  end if;
  return new;
end $$;

create or replace function public.quick_reply_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan; n int; lim int;
begin
  select plan into p from public.houses where id = new.house_id;
  lim := public.plan_cap_int(p::text, 'quick_replies');
  if lim <= 0 then raise exception 'As respostas rápidas não estão disponíveis no seu plano.'; end if;
  select count(*) into n from public.house_quick_replies where house_id = new.house_id;
  if n >= lim then
    raise exception 'Seu plano permite até % respostas rápidas.', lim;
  end if;
  return new;
end $$;

create or replace function public.my_campaign_days(p_campaign uuid, p_days int default 30)
returns table (day date, visits int, contacts int)
language plpgsql stable security definer set search_path = public as $$
declare p public.house_plan;
begin
  select h.plan into p from public.house_campaigns hc join public.houses h on h.id = hc.house_id
    where hc.id = p_campaign and h.owner_id = auth.uid();
  if p is null then raise exception 'Link não encontrado.'; end if;
  if not public.plan_cap_bool(p::text, 'campaign_daily_count') then raise exception 'A contagem dia a dia não está disponível no seu plano.'; end if;
  return query select d.day, d.visits, d.contacts from public.house_campaign_days d
    where d.campaign_id = p_campaign and d.day >= (now() at time zone 'America/Sao_Paulo')::date - greatest(p_days,1) + 1
    order by d.day;
end $$;

create or replace function public.conversation_has_premium_house(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members cm
    join public.houses h on h.owner_id = cm.user_id
    where cm.conversation_id = c and public.plan_cap_bool(h.plan::text, 'chat_media')
  );
$$;

create or replace function public.member_my_house()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare h uuid; p public.house_plan;
begin
  select id, plan into h, p from public.houses where owner_id = auth.uid();
  if h is null then raise exception 'Somente a casa pode fazer isso.'; end if;
  if not public.plan_cap_bool(p::text, 'members_area') then raise exception 'A área de membros não está disponível no seu plano.'; end if;
  return h;
end $$;

create or replace function public.calendar_premium_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan;
begin
  select plan into p from public.houses where id = new.house_id;
  if not public.plan_cap_bool(p::text, 'calendar_full') then
    new.vis_followers := false;
    new.yearly := false;
  end if;
  return new;
end $$;

create or replace function public.house_seat_allowance(h uuid)
returns int language sql stable security definer set search_path = public as $$
  select public.plan_cap_int((select plan::text from public.houses where id = h), 'included_seats')
       + coalesce((select seats from public.house_extra_seats where house_id = h), 0);
$$;

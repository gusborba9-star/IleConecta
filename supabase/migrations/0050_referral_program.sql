-- Indique e ganhe entre casas. Construído e DESLIGADO por padrão (features.referral no painel admin).
-- Fluxo: a casa indicada cria a conta com ?ref=CÓDIGO -> registro "pendente" -> no primeiro login (last_sign_in_at deixa de ser nulo)
-- a casa que indicou ganha dias de destaque (house_rewards), respeitando o limite mensal. Tudo passa por funções; as tabelas ficam fechadas por RLS.

alter table public.houses add column if not exists referral_code text;
update public.houses set referral_code = upper(substr(md5(id::text || 'ile-ref'), 1, 7)) where referral_code is null;
alter table public.houses alter column referral_code set default upper(substr(md5(gen_random_uuid()::text), 1, 7));
alter table public.houses alter column referral_code set not null;
create unique index if not exists houses_referral_code_key on public.houses (referral_code);

create table if not exists public.house_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_house_id uuid not null references public.houses(id) on delete cascade,
  referred_house_id uuid not null unique references public.houses(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','concedido','recusado')),
  reason text,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists house_referrals_referrer on public.house_referrals (referrer_house_id, status);
alter table public.house_referrals enable row level security;

create table if not exists public.house_rewards (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  kind text not null default 'destaque' check (kind in ('destaque')),
  source text not null check (source in ('indicou','foi_indicada')),
  referral_id uuid references public.house_referrals(id) on delete set null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists house_rewards_active on public.house_rewards (house_id, expires_at);
alter table public.house_rewards enable row level security;
revoke all on public.house_referrals, public.house_rewards from anon, authenticated;

alter table public.platform_settings drop constraint if exists platform_settings_key_check;
alter table public.platform_settings add constraint platform_settings_key_check check (key = any (array['features','pricing','scopes','payment_limits','referral']));

-- Configuração: ligado só com features.referral.state = 'on'; prêmio e limite vêm de platform_settings('referral').
create or replace function public.referral_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select value v from public.platform_settings where key = 'referral'),
       f as (select value -> 'referral' ->> 'state' st from public.platform_settings where key = 'features'),
       n as (select
         (select case when (v ->> 'reward_days') ~ '^[0-9]{1,3}$' then (v ->> 'reward_days')::int end from s) rd,
         (select case when (v ->> 'referred_days') ~ '^[0-9]{1,3}$' then (v ->> 'referred_days')::int end from s) fd,
         (select case when (v ->> 'monthly_cap') ~ '^[0-9]{1,3}$' then (v ->> 'monthly_cap')::int end from s) mc)
  select jsonb_build_object(
    'enabled', coalesce((select st = 'on' from f), false),
    'reward_days', case when rd is null then 7 else least(greatest(rd, 1), 90) end,
    'referred_days', case when fd is null then 0 else least(greatest(fd, 0), 90) end,
    'monthly_cap', case when mc is null then 3 else least(greatest(mc, 1), 100) end
  ) from n;
$$;
revoke all on function public.referral_settings() from public, anon;
grant execute on function public.referral_settings() to authenticated;

-- Cadastro: registra a indicação (nunca atrapalha a criação da conta).
create or replace function public.referral_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'referral_code', ''))); r_house uuid; n_house uuid;
begin
  if code = '' or (new.raw_user_meta_data ->> 'account_type') is distinct from 'casa' then return new; end if;
  select id into r_house from public.houses where referral_code = code;
  select id into n_house from public.houses where owner_id = new.id;
  if r_house is null or n_house is null or r_house = n_house then return new; end if;
  insert into public.house_referrals (referrer_house_id, referred_house_id) values (r_house, n_house) on conflict do nothing;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.referral_on_signup() from public, anon, authenticated;
create trigger on_auth_user_zreferral after insert on auth.users for each row execute function public.referral_on_signup();

-- Primeiro login da casa indicada: concede o prêmio (ou recusa, com o motivo).
create or replace function public.referral_on_first_login()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref public.house_referrals%rowtype; cfg jsonb; n_house uuid; r_owner uuid; n_name text;
  granted_month int; base timestamptz; d int;
begin
  if old.last_sign_in_at is not null or new.last_sign_in_at is null then return new; end if;
  select h.id into n_house from public.houses h where h.owner_id = new.id;
  if n_house is null then return new; end if;
  select * into ref from public.house_referrals where referred_house_id = n_house and status = 'pendente';
  if not found then return new; end if;
  cfg := public.referral_settings();
  if not (cfg ->> 'enabled')::boolean then
    update public.house_referrals set status = 'recusado', reason = 'programa_desligado' where id = ref.id;
    return new;
  end if;
  select count(*) into granted_month from public.house_referrals
    where referrer_house_id = ref.referrer_house_id and status = 'concedido'
      and rewarded_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  if granted_month >= (cfg ->> 'monthly_cap')::int then
    update public.house_referrals set status = 'recusado', reason = 'limite_mensal' where id = ref.id;
    return new;
  end if;
  select owner_id into r_owner from public.houses where id = ref.referrer_house_id;
  select name into n_name from public.houses where id = n_house;
  d := (cfg ->> 'reward_days')::int;
  select greatest(now(), coalesce(max(expires_at), now())) into base from public.house_rewards where house_id = ref.referrer_house_id and expires_at > now();
  insert into public.house_rewards (house_id, source, referral_id, starts_at, expires_at)
    values (ref.referrer_house_id, 'indicou', ref.id, base, base + make_interval(days => d));
  d := (cfg ->> 'referred_days')::int;
  if d > 0 then
    insert into public.house_rewards (house_id, source, referral_id, starts_at, expires_at)
      values (n_house, 'foi_indicada', ref.id, now(), now() + make_interval(days => d));
  end if;
  update public.house_referrals set status = 'concedido', rewarded_at = now() where id = ref.id;
  insert into public.notifications (user_id, text, href)
    values (r_owner, 'A casa ' || n_name || ' entrou pela sua indicação. Sua casa ganhou ' || (cfg ->> 'reward_days') || ' dias em destaque.', '/');
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.referral_on_first_login() from public, anon, authenticated;
create trigger on_auth_user_zreferral_login after update of last_sign_in_at on auth.users for each row execute function public.referral_on_first_login();

-- Funções usadas pelo app.
create or replace function public.my_referral()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h public.houses%rowtype; cfg jsonb := public.referral_settings();
begin
  select * into h from public.houses where owner_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'code', h.referral_code,
    'enabled', cfg -> 'enabled', 'reward_days', cfg -> 'reward_days', 'referred_days', cfg -> 'referred_days', 'monthly_cap', cfg -> 'monthly_cap',
    'active_until', (select max(expires_at) from public.house_rewards where house_id = h.id and expires_at > now()),
    'granted_this_month', (select count(*) from public.house_referrals where referrer_house_id = h.id and status = 'concedido'
        and rewarded_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'status', x.status, 'reason', x.reason, 'at', x.created_at) order by x.created_at desc)
        from (select r.status, r.reason, r.created_at, n.name from public.house_referrals r join public.houses n on n.id = r.referred_house_id
              where r.referrer_house_id = h.id order by r.created_at desc limit 50) x), '[]'::jsonb)
  );
end $$;

create or replace function public.referral_lookup(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select h.name from public.houses h
  where h.referral_code = upper(btrim(p_code)) and coalesce((public.referral_settings() ->> 'enabled')::boolean, false);
$$;

create or replace function public.house_featured()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(h.owner_id::text, x.until), '{}'::jsonb)
  from (select house_id, max(expires_at) until from public.house_rewards where expires_at > now() and starts_at <= now() group by house_id) x
  join public.houses h on h.id = x.house_id;
$$;

revoke all on function public.my_referral(), public.referral_lookup(text), public.house_featured() from public, anon;
grant execute on function public.my_referral(), public.house_featured() to authenticated;
grant execute on function public.referral_lookup(text) to anon, authenticated;

-- Painel admin aceita a nova chave "referral" (dias de prêmio e limite mensal).
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare old_val jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_key not in ('features', 'pricing', 'scopes', 'payment_limits', 'referral') then raise exception 'invalid_key'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
    raise exception 'invalid_value';
  end if;
  if p_key = 'payment_limits' then
    if jsonb_typeof(p_value -> 'max_cents') <> 'number'
       or (p_value ->> 'max_cents') !~ '^[0-9]+$'
       or (p_value ->> 'max_cents')::bigint not between 10000 and 10000000 then
      raise exception 'O teto por pagamento deve ficar entre R$ 100 e R$ 100.000.';
    end if;
  end if;
  if p_key = 'referral' then
    if (p_value ->> 'reward_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'reward_days')::int not between 1 and 90
       or (p_value ->> 'referred_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'referred_days')::int not between 0 and 90
       or (p_value ->> 'monthly_cap') !~ '^[0-9]{1,3}$' or (p_value ->> 'monthly_cap')::int not between 1 and 100 then
      raise exception 'Dias de prêmio entre 1 e 90, dias da casa indicada entre 0 e 90 e limite mensal entre 1 e 100.';
    end if;
  end if;
  select value into old_val from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), p_key, old_val, p_value);
end $$;

-- Painel administrativo: administradores, configurações editáveis (interruptores, preços, alcance),
-- histórico de alterações e métricas agregadas. Tudo sem mexer em código nem fazer deploy.

-- 1) Quem é administrador. Sem políticas de propósito: ninguém lê nem escreve pelo cliente.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2) Configurações da plataforma (nada secreto aqui: o site precisa ler preços e interruptores).
create table if not exists public.platform_settings (
  key text primary key check (key in ('features', 'pricing', 'scopes')),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_settings enable row level security;
drop policy if exists settings_read on public.platform_settings;
create policy settings_read on public.platform_settings for select using (true);
-- Sem políticas de escrita: só a função admin_set_setting grava.

-- 3) Histórico de alterações.
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id),
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists audit_read on public.admin_audit;
create policy audit_read on public.admin_audit for select to authenticated using (public.is_admin());

-- 4) Gravação controlada (só administrador) com registro no histórico.
create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old_val jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_key not in ('features', 'pricing', 'scopes') then raise exception 'invalid_key'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
    raise exception 'invalid_value';
  end if;
  select value into old_val from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), p_key, old_val, p_value);
end $$;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- 5) Métricas agregadas (nunca dados pessoais).
create or replace function public.admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'houses_total', (select count(*) from public.houses),
    'clients_total', (select count(*) from public.profiles where account_type <> 'casa'),
    'houses_by_plan', (select coalesce(jsonb_object_agg(plan, c), '{}'::jsonb)
                         from (select plan::text as plan, count(*) as c from public.houses group by plan) t),
    'signups_30d', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb)
                      from (select created_at::date as d, count(*) as n from public.profiles
                             where created_at > now() - interval '30 days' group by 1) t),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'state', state, 'city', city, 'users', users, 'houses', houses) order by users desc), '[]'::jsonb)
                  from (select coalesce(country, 'BR') as country,
                               coalesce(nullif(trim(state), ''), '—') as state,
                               coalesce(nullif(trim(city), ''), '—') as city,
                               count(*) as users,
                               count(*) filter (where account_type = 'casa') as houses
                          from public.profiles group by 1, 2, 3 order by users desc limit 50) t),
    'assistant_month', (select jsonb_build_object('replies', count(*),
                               'prompt_tokens', coalesce(sum(prompt_tokens), 0),
                               'completion_tokens', coalesce(sum(completion_tokens), 0))
                          from public.assistant_usage where created_at >= date_trunc('month', now()))
  );
end $$;
revoke execute on function public.admin_metrics() from public, anon;
grant execute on function public.admin_metrics() to authenticated;

-- 6) Valores iniciais (editáveis depois pelo painel). Só entram se ainda não existirem.
insert into public.platform_settings (key, value) values
  ('features', '{"assistant":{"state":"on","beta_houses":[]},"boost":{"state":"on","beta_houses":[]},"highlight":{"state":"on","beta_houses":[]}}'::jsonb),
  ('pricing', '{"plans":{"base":{"name":"Essencial","monthly":89.9},"intermediario":{"name":"Profissional","monthly":139.9},"maximo":{"name":"Premium","monthly":199}},"boost_per_day":{"cidade":19.9,"estado":29.9,"pais":39.9,"exterior":null},"highlight_per_day":{"cidade":29.9,"estado":39.9,"pais":49.9,"exterior":null}}'::jsonb),
  ('scopes', '{"boost":{"cidade":true,"estado":true,"pais":false,"exterior":false},"highlight":{"cidade":true,"estado":true,"pais":false,"exterior":false}}'::jsonb)
on conflict (key) do nothing;

-- 0189 — Pesos e limites da recuperação ficam em tabela PRIVADA (platform_settings é de leitura pública e entregaria o critério a quem quisesse burlar).
create table if not exists public.recovery_settings (
  id boolean primary key default true check (id),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
alter table public.recovery_settings enable row level security;
revoke all on table public.recovery_settings from public, anon, authenticated;

insert into public.recovery_settings (value) values ('{"weights":{"word":40,"email":25,"last_tx":25,"signup":15,"members":15,"top_houses":20,"last_access":10,"assistant_name":8,"plan":6,"had_tx":4,"uses_assistant":4,"staff":4,"name":3,"city":2},"strong":["word","email","last_tx","signup","members","top_houses"],"approve":{"minStrongHits":2,"minRatio":0.75},"second":{"minStrongHits":1,"minRatio":0.5},"minAnswered":4,"candidateMinId":0.5,"ambiguityGap":0.1}'::jsonb)
on conflict (id) do nothing;

create or replace function public.admin_recovery_scoring_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return (select value from public.recovery_settings where id);
end $$;

create or replace function public.admin_recovery_scoring_set(p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if jsonb_typeof(p_value) <> 'object' or char_length(p_value::text) > 4000 then raise exception 'Configuração inválida.' using errcode = '22023'; end if;
  insert into public.recovery_settings (id, value, updated_at, updated_by) values (true, p_value, now(), auth.uid())
  on conflict (id) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function public.recovery_scoring_get()
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.recovery_settings where id
$$;

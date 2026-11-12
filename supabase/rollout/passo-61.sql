-- PASSO 61: 0084_taxas_versionadas — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: tabela central de taxas da plataforma, versionada e editável só pelo administrador (Blueprint §19.1 e §19.2).
-- A taxa de cada pagamento é gravada na criação, junto com a versão da regra. Mudar a regra vale só para pagamentos NOVOS; nada do passado é recalculado.

-- ============ 1) versões da regra (imutáveis) ============
create or replace function public.fee_rates_ok(r jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(r) = 'object'
    and (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['mensalidade', 'ritual', 'servico']
    and jsonb_typeof(r -> 'ritual') = 'number' and jsonb_typeof(r -> 'servico') = 'number' and jsonb_typeof(r -> 'mensalidade') = 'number'
    and (r ->> 'ritual') ~ '^[0-9]{1,4}$' and (r ->> 'servico') ~ '^[0-9]{1,4}$' and (r ->> 'mensalidade') ~ '^[0-9]{1,4}$'
    and (r ->> 'ritual')::int <= 3000 and (r ->> 'servico')::int <= 3000 and (r ->> 'mensalidade')::int <= 3000;
$$;

create table if not exists public.fee_rule_versions (
  seq bigint generated always as identity unique,
  version text primary key check (version ~ '^v[0-9]+-[0-9a-z-]+$'),
  rates jsonb not null,
  reason text not null check (char_length(btrim(reason)) >= 10),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint fee_rates_shape check (public.fee_rates_ok(rates))
);

alter table public.fee_rule_versions enable row level security;

drop policy if exists fee_rules_admin_read on public.fee_rule_versions;

create policy fee_rules_admin_read on public.fee_rule_versions for select to authenticated using (public.is_admin());

create or replace function public.fee_rule_versions_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'As versões da regra de taxas não podem ser alteradas nem apagadas.';
end $$;

drop trigger if exists trg_fee_rule_versions_immutable on public.fee_rule_versions;

create trigger trg_fee_rule_versions_immutable before update or delete on public.fee_rule_versions
  for each row execute function public.fee_rule_versions_immutable();

revoke all on function public.fee_rule_versions_immutable() from public, anon, authenticated;

-- Regra em vigor desde o início: a que já está nos pagamentos (15% ritual coletivo, 4% serviços e mensalidades).
insert into public.fee_rule_versions (version, rates, reason)
values ('v2-2026-10', '{"ritual":1500,"servico":400,"mensalidade":400}'::jsonb, 'Regra aprovada em outubro de 2026 (Blueprint §19.1): 15% em ritual coletivo e 4% nas demais transações.')
on conflict (version) do nothing;

-- ============ 2) regra vigente e cálculo da comissão ============
create or replace function public.current_fee_rules()
returns table (version text, rates jsonb)
language sql stable security definer set search_path = public as $$
  select v.version, v.rates from public.fee_rule_versions v order by v.seq desc limit 1;
$$;

create or replace function public.fee_cents(p_gross bigint, p_kind text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare bps integer; r jsonb;
begin
  select c.rates into r from public.current_fee_rules() c;
  bps := (r ->> case p_kind when 'servico_pix' then 'servico' else p_kind end)::integer;
  if bps is null or p_gross is null or p_gross < 0 then raise exception 'Valor ou tipo de taxa inválido.'; end if;
  return (p_gross * bps + 5000) / 10000;
end $$;

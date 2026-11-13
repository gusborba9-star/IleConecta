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

-- ============ 3) cada pagamento novo guarda a versão e a comissão da regra vigente (uma só leitura, sem corrida) ============
create or replace function public.payments_stamp_fee_rule() returns trigger
language plpgsql security definer set search_path = public as $$
declare ver text; r jsonb; kind text; bps integer;
begin
  select c.version, c.rates into ver, r from public.current_fee_rules() c;
  if ver is null then return new; end if;
  new.fee_rule_version := ver;
  kind := case when new.reservation_id is not null then 'ritual' when new.order_id is not null then 'servico' when new.member_due_id is not null then 'mensalidade' end;
  if kind is not null then
    bps := (r ->> kind)::integer;
    new.fee_cents := (new.gross_cents * bps + 5000) / 10000;
  end if;
  return new;
end $$;
drop trigger if exists trg_payments_stamp_fee_rule on public.payments;
create trigger trg_payments_stamp_fee_rule before insert on public.payments
  for each row execute function public.payments_stamp_fee_rule();

-- ============ 4) alteração pelo administrador (motivo obrigatório, histórico no admin_audit) ============
create or replace function public.admin_set_fee_rules(p_rates jsonb, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare cur record; nxt bigint; ver text; k text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
  if p_rates is null or jsonb_typeof(p_rates) <> 'object' then raise exception 'Taxas inválidas.'; end if;
  foreach k in array array['ritual', 'servico', 'mensalidade'] loop
    if coalesce(jsonb_typeof(p_rates -> k), '') <> 'number' or (p_rates ->> k) !~ '^[0-9]{1,4}$' or (p_rates ->> k)::int > 3000 then
      raise exception 'Cada taxa deve ser um número inteiro de pontos-base entre 0 e 3000 (100 = 1%%).';
    end if;
  end loop;
  lock table public.fee_rule_versions in exclusive mode;
  select * into cur from public.fee_rule_versions order by seq desc limit 1;
  if (cur.rates ->> 'ritual') = (p_rates ->> 'ritual') and (cur.rates ->> 'servico') = (p_rates ->> 'servico') and (cur.rates ->> 'mensalidade') = (p_rates ->> 'mensalidade') then
    raise exception 'Nenhuma taxa mudou.';
  end if;
  select count(*) + 2 into nxt from public.fee_rule_versions;
  ver := 'v' || nxt || '-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  while exists (select 1 from public.fee_rule_versions where version = ver) loop ver := ver || '-b'; end loop;
  insert into public.fee_rule_versions (version, rates, reason, created_by)
    values (ver, jsonb_build_object('ritual', (p_rates ->> 'ritual')::int, 'servico', (p_rates ->> 'servico')::int, 'mensalidade', (p_rates ->> 'mensalidade')::int), left(btrim(p_reason), 500), auth.uid());
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'fee_rules', jsonb_build_object('version', cur.version, 'rates', cur.rates),
            jsonb_build_object('version', ver, 'rates', p_rates, 'reason', left(btrim(p_reason), 500)));
  return ver;
end $$;

-- ============ 5) permissões ============
revoke all on function public.fee_rates_ok(jsonb), public.current_fee_rules(), public.fee_cents(bigint, text), public.payments_stamp_fee_rule(), public.admin_set_fee_rules(jsonb, text) from public, anon, authenticated;
grant execute on function public.current_fee_rules(), public.fee_cents(bigint, text) to service_role;
grant execute on function public.admin_set_fee_rules(jsonb, text) to authenticated;
revoke all on public.fee_rule_versions from anon, authenticated;
grant select on public.fee_rule_versions to authenticated;

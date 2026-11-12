-- PASSO 62: 0084_taxas_versionadas — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

-- 0124 — Aviso de 30 dias para mudar o prazo do bloqueio total (decisão aceita em 13/11/2026; Blueprint §cobrança).
-- Quando o administrador muda "dias até o bloqueio total" no painel, a mudança NÃO vale na hora: fica agendada para daqui a 30 dias
-- (billing_config.total_block_next = {days, from}) e todas as casas matriculadas na cobrança recebem o aviso. Até lá vale o prazo atual.
-- Quem decide é o banco (gatilho): o painel não consegue pular o aviso nem escolher a data. Voltar ao prazo atual cancela a mudança.

-- ============ 1) Configuração válida: aceita o campo opcional total_block_next {days 7..90, from AAAA-MM-DD}
create or replace function public.billing_config_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; x jsonb; kinds text[] := array['plan','extra_seat','credit_pack','highlight','boost']; meths text[] := array['card','card_recurring','pix'];
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a where a not in ('total_block_days', 'total_block_next', 'pix_discount')) is distinct from array['enabled','methods','notice_days','provider','tolerance_business_days'] then return false; end if;
if m ? 'total_block_days' and (coalesce(jsonb_typeof(m -> 'total_block_days'), '') <> 'number' or (m ->> 'total_block_days') !~ '^[0-9]{1,2}$' or (m ->> 'total_block_days')::int not between 7 and 90) then return false; end if;
if m ? 'total_block_next' then
v := m -> 'total_block_next';
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from array['days','from'] then return false; end if;
if coalesce(jsonb_typeof(v -> 'days'), '') <> 'number' or (v ->> 'days') !~ '^[0-9]{1,2}$' or (v ->> 'days')::int not between 7 and 90 then return false; end if;
if coalesce(jsonb_typeof(v -> 'from'), '') <> 'string' or (v ->> 'from') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then return false; end if;
end if;
if m ? 'pix_discount' then
v := m -> 'pix_discount';
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from array['enabled','ends_days_before','pct'] then return false; end if;
if coalesce(jsonb_typeof(v -> 'enabled'), '') <> 'boolean' then return false; end if;
if coalesce(jsonb_typeof(v -> 'pct'), '') <> 'number' or (v ->> 'pct') !~ '^[0-9]{1,2}$' or (v ->> 'pct')::int not between 1 and 20 then return false; end if;
if coalesce(jsonb_typeof(v -> 'ends_days_before'), '') <> 'number' or (v ->> 'ends_days_before') !~ '^[0-9]{1,2}$' or (v ->> 'ends_days_before')::int not between 0 and 14 then return false; end if;
end if;
if coalesce(jsonb_typeof(m -> 'enabled'), '') <> 'boolean' then return false; end if;
foreach k in array array['notice_days','tolerance_business_days'] loop
if coalesce(jsonb_typeof(m -> k), '') <> 'number' or (m ->> k) !~ '^[0-9]{1,2}$' then return false; end if;
end loop;
if (m ->> 'notice_days')::int not between 1 and 15 then return false; end if;
if (m ->> 'tolerance_business_days')::int not between 0 and 10 then return false; end if;
foreach k in array array['provider','methods'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from (select array_agg(a order by a) from unnest(kinds) a) then return false; end if;
end loop;
foreach k in array kinds loop
if coalesce(jsonb_typeof(m -> 'provider' -> k), '') <> 'string' or (m -> 'provider' ->> k) !~ '^[a-z][a-z0-9_]{1,23}$' then return false; end if;
v := m -> 'methods' -> k;
if coalesce(jsonb_typeof(v), '') <> 'array' or jsonb_array_length(v) not between 1 and 3 then return false; end if;
for x in select jsonb_array_elements(v) loop
if coalesce(jsonb_typeof(x), '') <> 'string' or not ((x #>> '{}') = any (meths)) then return false; end if;
end loop;
if (select count(distinct e) from jsonb_array_elements_text(v) e) <> jsonb_array_length(v) then return false; end if;
end loop;
return true;
end $$;

-- ============ 2) Prazo em vigor: o agendado entra no dia marcado (dia de São Paulo)
create or replace function public.billing_total_days() returns int
language sql stable security definer set search_path = public as $$
select coalesce(
  case when (public.platform_billing_config() -> 'total_block_next' ->> 'from')::date <= (now() at time zone 'America/Sao_Paulo')::date
       then (public.platform_billing_config() -> 'total_block_next' ->> 'days')::int end,
  nullif((public.platform_billing_config() ->> 'total_block_days'), '')::int,
  30);
$$;

-- ============ 3) Gatilho: agenda a mudança, guarda o prazo em vigor e avisa as casas
create or replace function public.billing_config_schedule_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'America/Sao_Paulo')::date; o jsonb := old.value; v jsonb := new.value - 'total_block_next';
eff int; pend jsonb; desired int; txt text;
begin
if new.key <> 'billing_config' then return new; end if;
if (o -> 'total_block_next' ->> 'from') is not null and (o -> 'total_block_next' ->> 'from')::date <= today then
  eff := (o -> 'total_block_next' ->> 'days')::int; pend := null;
else
  eff := coalesce(nullif(o ->> 'total_block_days', '')::int, 30); pend := o -> 'total_block_next';
end if;
desired := coalesce(nullif(v ->> 'total_block_days', '')::int, eff);
if desired = eff then
  new.value := v || jsonb_build_object('total_block_days', eff);
  if pend is not null then
    txt := 'Aviso: a mudança do prazo do bloqueio total foi cancelada. O prazo continua de ' || eff || ' dias.';
  end if;
elsif pend is not null and (pend ->> 'days')::int = desired then
  new.value := v || jsonb_build_object('total_block_days', eff, 'total_block_next', pend);
else
  new.value := v || jsonb_build_object('total_block_days', eff, 'total_block_next', jsonb_build_object('days', desired, 'from', to_char(today + 30, 'YYYY-MM-DD')));
  txt := 'Aviso: a partir de ' || to_char(today + 30, 'DD/MM/YYYY') || ', o prazo entre a suspensão parcial e o bloqueio total da casa por falta de pagamento passa de ' || eff || ' para ' || desired || ' dias. Até lá vale o prazo atual.';
end if;
if txt is not null then
  insert into public.notifications (user_id, text, href)
  select distinct h.owner_id, txt, '/planos' from public.houses h
  join public.house_billing_plan b on b.house_id = h.id and b.active
  where not exists (select 1 from public.notifications x where x.user_id = h.owner_id and x.text = txt);
end if;
return new;
end $$;

drop trigger if exists billing_config_schedule_total on public.platform_settings;
create trigger billing_config_schedule_total before update on public.platform_settings
for each row when (new.key = 'billing_config') execute function public.billing_config_schedule_total();

-- ============ 4) permissões (função de gatilho não é chamada por ninguém; tira o acesso padrão)
revoke all on function public.billing_config_schedule_total() from public, anon, authenticated, service_role;

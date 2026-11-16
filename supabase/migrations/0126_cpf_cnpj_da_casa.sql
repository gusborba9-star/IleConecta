-- 0126 — CPF/CNPJ da casa na contratação de plano pago (decisões do proprietário, 15/11/2026).
-- Pedido ao contratar plano pago (assinar, reativar, subir de plano, comprar vaga extra); a casa Grátis não precisa informar.
-- Guardado protegido: criptografado no banco com chave do cofre (Vault), sem acesso direto de nenhum usuário; a casa vê só o final mascarado.
-- A administração consulta o número completo só por função que exige motivo e registra a consulta. Uso: cobrança e obrigações fiscais.
-- Casas que já assinam não são bloqueadas: o pedido aparece em Planos e o dado passa a ser exigido na próxima contratação.

-- ============ 1) Validação dos dígitos (CPF e CNPJ) e máscaras
create or replace function public.tax_id_kind(p text) returns text
language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'); a int[]; s int; r int; i int; w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
if d ~ '^(.)\1*$' then return null; end if;
if length(d) = 11 then
  select array_agg(substr(d, g, 1)::int order by g) into a from generate_series(1, 11) g;
  s := 0; for i in 1..9 loop s := s + a[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> a[10] then return null; end if;
  s := 0; for i in 1..10 loop s := s + a[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> a[11] then return null; end if;
  return 'cpf';
elsif length(d) = 14 then
  select array_agg(substr(d, g, 1)::int order by g) into a from generate_series(1, 14) g;
  s := 0; for i in 1..12 loop s := s + a[i] * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> a[13] then return null; end if;
  s := 0; for i in 1..13 loop s := s + a[i] * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> a[14] then return null; end if;
  return 'cnpj';
end if;
return null;
end $$;

create or replace function public.tax_id_format(p text) returns text
language sql immutable set search_path = public as $$
select case length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'))
  when 11 then regexp_replace(regexp_replace(p, '[^0-9]', '', 'g'), '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')
  when 14 then regexp_replace(regexp_replace(p, '[^0-9]', '', 'g'), '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5')
  else null end;
$$;

-- ============ 2) Chave de criptografia no cofre (criada uma vez) e tabelas fechadas
do $$
begin
if not exists (select 1 from vault.decrypted_secrets where name = 'tax_id_key') then
  perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'tax_id_key', 'Chave do CPF/CNPJ das casas (não apagar: sem ela os documentos não abrem)');
end if;
end $$;

create table if not exists public.house_tax_ids (
house_id uuid primary key references public.houses(id) on delete cascade,
kind text not null check (kind in ('cpf', 'cnpj')),
doc_enc bytea not null,
masked text not null check (char_length(masked) between 10 and 30),
set_by uuid,
set_at timestamptz not null default now()
);

create table if not exists public.tax_id_access_log (
id bigint generated always as identity primary key,
admin_id uuid not null,
house_id uuid not null,
action text not null check (action in ('ver', 'corrigir')),
reason text not null check (char_length(reason) between 10 and 300),
at timestamptz not null default now()
);

alter table public.house_tax_ids enable row level security;

alter table public.tax_id_access_log enable row level security;

revoke all on public.house_tax_ids, public.tax_id_access_log from public, anon, authenticated;

-- ============ 3) Funções internas (chave, exigência na contratação)
create or replace function public.tax_id_key() returns text
language sql stable security definer set search_path = public, extensions as $$
select decrypted_secret from vault.decrypted_secrets where name = 'tax_id_key' limit 1;
$$;

create or replace function public.platform_require_tax_id(p_house uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
if not exists (select 1 from public.house_tax_ids where house_id = p_house) then
raise exception 'Informe o CPF ou CNPJ da casa em Planos antes de contratar.';
end if;
end $$;

-- ============ 4) A casa informa (uma vez) e vê só o final
create or replace function public.tax_id_store(p_house uuid, p_doc text, p_by uuid, p_replace boolean) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d text := regexp_replace(coalesce(p_doc, ''), '[^0-9]', '', 'g'); k text := public.tax_id_kind(p_doc); key text := public.tax_id_key(); m text;
begin
if k is null then raise exception 'CPF ou CNPJ inválido. Confira os números.'; end if;
if key is null then raise exception 'Não foi possível guardar o documento agora. Tente de novo.'; end if;
m := case k when 'cpf' then '***.***.***-' || right(d, 2) else '**.***.***/****-' || right(d, 2) end;
if p_replace then
  insert into public.house_tax_ids (house_id, kind, doc_enc, masked, set_by) values (p_house, k, pgp_sym_encrypt(d, key), m, p_by)
  on conflict (house_id) do update set kind = excluded.kind, doc_enc = excluded.doc_enc, masked = excluded.masked, set_by = excluded.set_by, set_at = now();
else
  insert into public.house_tax_ids (house_id, kind, doc_enc, masked, set_by) values (p_house, k, pgp_sym_encrypt(d, key), m, p_by);
end if;
return k;
end $$;

create or replace function public.my_tax_id_set(p_doc text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; k text;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa informa o CPF ou CNPJ.'; end if;
if exists (select 1 from public.house_tax_ids where house_id = h) then raise exception 'O documento já foi informado. Para corrigir, fale com o Suporte.'; end if;
begin
k := public.tax_id_store(h, p_doc, me, false);
exception when unique_violation then raise exception 'O documento já foi informado. Para corrigir, fale com o Suporte.';
end;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'documento_informado', 'processado', h::text || ':' || k);
return jsonb_build_object('kind', k);
end $$;

create or replace function public.my_tax_id_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; t public.house_tax_ids;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
select * into t from public.house_tax_ids where house_id = h;
return jsonb_build_object('has_house', true, 'set', found, 'kind', t.kind, 'masked', t.masked,
  'subscribed', exists (select 1 from public.house_billing_plan where house_id = h and active));
end $$;

-- ============ 5) Administração: consulta com motivo (registrada) e correção com motivo
create or replace function public.admin_house_tax_id(p_house uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t public.house_tax_ids; d text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_reason is null or char_length(btrim(p_reason)) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
select * into t from public.house_tax_ids where house_id = p_house;
if not found then return jsonb_build_object('set', false); end if;
d := pgp_sym_decrypt(t.doc_enc, public.tax_id_key());
insert into public.tax_id_access_log (admin_id, house_id, action, reason) values (auth.uid(), p_house, 'ver', left(btrim(p_reason), 300));
return jsonb_build_object('set', true, 'kind', t.kind, 'doc', public.tax_id_format(d), 'set_at', t.set_at);
end $$;

create or replace function public.admin_house_tax_id_set(p_house uuid, p_doc text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_reason is null or char_length(btrim(p_reason)) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
k := public.tax_id_store(p_house, p_doc, auth.uid(), true);
insert into public.tax_id_access_log (admin_id, house_id, action, reason) values (auth.uid(), p_house, 'corrigir', left(btrim(p_reason), 300));
return jsonb_build_object('kind', k);
end $$;

-- ============ 6) Contratar plano pago, reativar, subir de plano e comprar vaga passam a exigir o documento
create or replace function public.platform_subscribe_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_amt bigint; v_open uuid; v_n int; v_id uuid;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then raise exception 'A cobrança da plataforma ainda não está ativa.'; end if;
perform 1 from public.houses where id = p_house for update;
if not found then raise exception 'Casa inexistente.'; end if;
if p_plan is null or p_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Escolha um plano com mensalidade.'; end if;
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then raise exception 'A assinatura está cancelada. Use a reativação da casa.'; end if;
if exists (select 1 from public.house_billing_plan where house_id = p_house and active) then raise exception 'A casa já tem assinatura ativa. Use a troca de plano.'; end if;
v_amt := public.platform_plan_monthly_cents(p_plan, v_day);
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade na tabela. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida') and amount_cents = v_amt and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
if exists (select 1 from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status = 'em_processamento') then raise exception 'Há um pagamento em processamento. Aguarde a confirmação.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%';
perform public.platform_require_tax_id(p_house);
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, v_amt, v_day, null, 'Assinatura do plano', 'assinatura:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_reactivation_issue(p_house uuid, p_plan text default null, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan text; v_amt bigint; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_open uuid; v_n int; v_id uuid; v_pricing jsonb; v_debt bigint;
begin
perform 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null for update;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
v_debt := public.platform_house_overdue_cents(p_house, v_day);
if v_debt > 0 then raise exception 'Pague a fatura vencida de % antes de reativar a conta.', public.billing_money_br(v_debt); end if;
select coalesce(p_plan, plan::text) into v_plan from public.houses where id = p_house;
if v_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Plano inválido.'; end if;
select value into v_pricing from public.platform_settings where key = 'pricing';
v_amt := case when (v_pricing -> 'plans' -> v_plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((v_pricing -> 'plans' -> v_plan ->> 'monthly')::numeric * 100)::bigint end;
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade para reativar. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida', 'em_processamento') and amount_cents = v_amt and item_key = 'plan:' || v_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%';
perform public.platform_require_tax_id(p_house);
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || v_plan, v_amt, v_day, null, 'Reativação do plano', 'reativacao:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reativacao_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_upgrade_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_upgrade_quote(p_house, p_plan, v_day);
perform public.platform_require_tax_id(p_house);
select id into v_open from public.platform_charges where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and kind = 'plan' and idempotency_key like 'upgrade:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, (q ->> 'amount_cents')::bigint, v_day, null, 'Upgrade do plano (diferença proporcional)', 'upgrade:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_solicitado', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_seat_issue(p_house uuid, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_seat_quote(p_house, v_day);
perform public.platform_require_tax_id(p_house);
select id into v_open from public.platform_charges where house_id = p_house and kind = 'extra_seat' and idempotency_key like 'upgrade:seat:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind = 'extra_seat' and idempotency_key like 'upgrade:seat:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'upgrade:seat:%';
v_id := public.platform_charge_issue(p_house, 'extra_seat', 'extra_seat', (q ->> 'amount_cents')::bigint, v_day, null, 'Vaga adicional de equipe (valor proporcional)', 'upgrade:seat:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

-- ============ 7) permissões
revoke all on function public.tax_id_kind(text), public.tax_id_format(text), public.tax_id_key(), public.platform_require_tax_id(uuid), public.tax_id_store(uuid, text, uuid, boolean),
  public.my_tax_id_set(text), public.my_tax_id_status(), public.admin_house_tax_id(uuid, text), public.admin_house_tax_id_set(uuid, text, text) from public, anon, authenticated;
grant execute on function public.my_tax_id_set(text), public.my_tax_id_status() to authenticated;
grant execute on function public.admin_house_tax_id(uuid, text), public.admin_house_tax_id_set(uuid, text, text) to authenticated;

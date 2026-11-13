-- Fase 4: cobrança automática do cartão salvo (mensalidade do plano e vagas extras de equipe).
-- Regras do proprietário (2026-11-13): cobra no dia do vencimento; se recusar, até 3 tentativas em dias seguidos (vencimento, +1, +2);
-- depois disso a fatura segue o fluxo normal (tolerância, suspensão parcial, bloqueio total) e a casa recebe aviso para pagar ou trocar o cartão;
-- aviso 3 dias antes ("será cobrada no cartão final XXXX") e 1 dia antes; a casa liga, desliga, troca e remove o cartão quando quiser.
-- Só vale para casas que ativaram: a cobrança automática nunca é ligada por outra pessoa, e só alcança faturas com vencimento a partir do dia da ativação.
-- O dinheiro entra pelo mesmo caminho do pagamento manual (platform_charge_confirm), então livro-razão, tarifa e duplicidade seguem as mesmas regras.
-- Estado de produção antes desta migration: nenhuma casa tem cartão guardado; existem só a fatura de teste da casa de teste e o pacote de créditos abandonado.
-- O Stripe é o único provedor hoje; o cartão guarda o id do provedor e os dados só ficam no servidor (nada disso é legível pelo navegador).

-- ============ 1) regra fixa: no máximo 3 tentativas por fatura ============
create or replace function public.billing_auto_max_attempts() returns int
language sql immutable set search_path = public as $$ select 3 $$;

-- a função só liga para quem o painel liberou: "card_recurring" nos meios do plano ou das vagas extras
create or replace function public.billing_auto_card_enabled() returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false)
and (coalesce(public.platform_billing_config() -> 'methods' -> 'plan', '[]'::jsonb) ? 'card_recurring'
or coalesce(public.platform_billing_config() -> 'methods' -> 'extra_seat', '[]'::jsonb) ? 'card_recurring');
$$;

-- ============ 2) cartão guardado por casa (só o servidor lê; a casa vê marca e final pela função my_card_status) ============
create table if not exists public.house_card_on_file (
house_id uuid primary key references public.houses(id) on delete cascade,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
customer_ref text not null check (char_length(customer_ref) between 1 and 200),
method_ref text check (method_ref is null or char_length(method_ref) between 1 and 200),
brand text check (brand is null or char_length(brand) <= 30),
last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
exp_month int check (exp_month is null or exp_month between 1 and 12),
exp_year int check (exp_year is null or exp_year between 2000 and 2200),
auto_enabled boolean not null default false,
saved_on date,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
check (method_ref is not null or auto_enabled = false)
);

alter table public.house_card_on_file enable row level security;

-- páginas de cadastro de cartão abertas: o retorno só vale para a casa que abriu (evita aplicar a sessão de outra casa)
create table if not exists public.house_card_setups (
ref text primary key check (char_length(ref) between 1 and 200),
house_id uuid not null references public.houses(id) on delete cascade,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
done boolean not null default false,
created_at timestamptz not null default now()
);

alter table public.house_card_setups enable row level security;

-- tentativas de cobrança automática (uma linha por fatura e número da tentativa)
create table if not exists public.platform_auto_attempts (
id bigint generated always as identity primary key,
charge_id uuid not null references public.platform_charges(id) on delete restrict,
attempt int not null check (attempt between 1 and 3),
outcome text not null check (outcome in ('iniciada', 'aprovada', 'recusada', 'exige_acao', 'processando')),
error_code text check (error_code is null or char_length(error_code) <= 80),
ref text check (ref is null or char_length(ref) <= 200),
last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique (charge_id, attempt)
);

alter table public.platform_auto_attempts enable row level security;

-- a administração só lê (nunca vê a referência do cartão: a tabela do cartão nem tem política de leitura)
drop policy if exists paa_read on public.platform_auto_attempts;

create policy paa_read on public.platform_auto_attempts for select to authenticated using (public.is_admin());

-- ============ 3) cadastro, troca, liga/desliga e remoção do cartão (chamados só pela função do servidor, que confere a dona) ============
create or replace function public.platform_card_customer(p_house uuid, p_provider text, p_customer text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
insert into public.house_card_on_file (house_id, provider, customer_ref) values (p_house, p_provider, p_customer)
on conflict (house_id) do nothing;
select customer_ref into v from public.house_card_on_file where house_id = p_house and provider = p_provider;
if v is null then raise exception 'A casa já tem cliente em outro provedor.'; end if;
return v;
end $$;

create or replace function public.platform_card_setup_open(p_house uuid, p_provider text, p_ref text) returns void
language sql security definer set search_path = public as $$
insert into public.house_card_setups (ref, house_id, provider) values (p_ref, p_house, p_provider) on conflict (ref) do nothing;
$$;

-- grava o cartão (a primeira vez ou a troca) e liga a cobrança automática; vale para faturas que vencem a partir de hoje
create or replace function public.platform_card_save(p_house uuid, p_provider text, p_setup_ref text, p_customer text, p_method text, p_brand text, p_last4 text, p_month int, p_year int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.house_card_setups; v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_old text;
begin
select * into s from public.house_card_setups where ref = p_setup_ref and house_id = p_house and provider = p_provider for update;
if not found then raise exception 'Cadastro de cartão desconhecido.'; end if;
if s.done then return jsonb_build_object('already', true); end if;
select method_ref into v_old from public.house_card_on_file where house_id = p_house;
update public.house_card_on_file set method_ref = p_method, brand = left(p_brand, 30), last4 = p_last4, exp_month = p_month, exp_year = p_year,
auto_enabled = true, saved_on = v_today, updated_at = now()
where house_id = p_house and provider = p_provider and customer_ref = p_customer;
if not found then raise exception 'Cliente do cartão não confere.'; end if;
update public.house_card_setups set done = true where ref = p_setup_ref;
return jsonb_build_object('already', false, 'previous_method', v_old);
end $$;

create or replace function public.platform_card_set_auto(p_house uuid, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare f public.house_card_on_file; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
select * into f from public.house_card_on_file where house_id = p_house for update;
if not found or f.method_ref is null then raise exception 'Cadastre um cartão primeiro.'; end if;
if f.auto_enabled = p_enabled then return p_enabled; end if;
-- ao religar, só valem faturas que vencem de hoje em diante (nunca cobra de surpresa uma fatura que já passou)
update public.house_card_on_file set auto_enabled = p_enabled, saved_on = case when p_enabled then v_today else saved_on end, updated_at = now() where house_id = p_house;
return p_enabled;
end $$;

create or replace function public.platform_card_remove(p_house uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
select method_ref into v from public.house_card_on_file where house_id = p_house for update;
update public.house_card_on_file set method_ref = null, brand = null, last4 = null, exp_month = null, exp_year = null, auto_enabled = false, updated_at = now() where house_id = p_house;
return v;
end $$;

-- o servidor precisa do cartão para cobrar e para a tela de remoção
create or replace function public.platform_card_get(p_house uuid) returns jsonb
language sql stable security definer set search_path = public as $$
select coalesce((select jsonb_build_object('provider', provider, 'customer', customer_ref, 'method', method_ref, 'brand', brand, 'last4', last4, 'auto_enabled', auto_enabled) from public.house_card_on_file where house_id = p_house), 'null'::jsonb);
$$;

-- ============ 4) quem cobrar agora (decide o banco; o servidor só executa) ============
-- Tentativa n vale no dia: vencimento + (n - 1). Uma por dia, nunca duas ao mesmo tempo. Tentativa "iniciada" que ficou sem desfecho é refeita
-- com a mesma chave (o provedor devolve o mesmo resultado, então não cobra duas vezes).
create or replace function public.platform_autocharge_due(p_now timestamptz default now())
returns table (charge_id uuid, house_id uuid, attempt int, amount_cents bigint, due_date date, provider text, customer_ref text, method_ref text, last4 text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; a record; n int;
begin
if not public.billing_auto_card_enabled() then return; end if;
for r in
select c.id, c.house_id as hid, c.amount_cents as amt, c.due_date as due, f.provider as prov, f.customer_ref as cust, f.method_ref as meth, f.last4 as l4
from public.platform_charges c join public.house_card_on_file f on f.house_id = c.house_id
where c.status in ('aberta', 'vencida') and c.kind in ('plan', 'extra_seat') and f.auto_enabled and f.method_ref is not null and c.due_date >= f.saved_on
and c.due_date <= d order by c.due_date, c.id
loop
select * into a from public.platform_auto_attempts t where t.charge_id = r.id order by t.attempt desc limit 1;
if not found then
n := 1;
elsif a.outcome = 'iniciada' then
n := a.attempt;
elsif a.outcome in ('recusada', 'exige_acao') then
-- depois de uma recusa, a próxima tentativa só vale em outro dia
if (a.updated_at at time zone 'America/Sao_Paulo')::date >= d then continue; end if;
n := a.attempt + 1;
else
continue; -- aprovada ou em processamento: aguarda a confirmação
end if;
if n > public.billing_auto_max_attempts() then continue; end if;
if d < r.due + (n - 1) then continue; end if;
charge_id := r.id; house_id := r.hid; attempt := n; amount_cents := r.amt; due_date := r.due; provider := r.prov; customer_ref := r.cust; method_ref := r.meth; last4 := r.l4;
return next;
end loop;
end $$;

-- reserva a tentativa (trava a fatura): se mudou de estado nesse meio tempo, não cobra
create or replace function public.platform_auto_attempt_begin(p_charge uuid, p_attempt int, p_now timestamptz default now()) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; a public.platform_auto_attempts; f public.house_card_on_file;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.status not in ('aberta', 'vencida') or c.kind not in ('plan', 'extra_seat') then return false; end if;
select * into f from public.house_card_on_file where house_id = c.house_id;
if not found or f.method_ref is null or not f.auto_enabled then return false; end if;
select * into a from public.platform_auto_attempts where charge_id = p_charge and attempt = p_attempt;
if found then
if a.outcome <> 'iniciada' then return false; end if;
update public.platform_auto_attempts set updated_at = now() where id = a.id;
return true;
end if;
if p_attempt <> coalesce((select max(t.attempt) from public.platform_auto_attempts t where t.charge_id = p_charge), 0) + 1 then return false; end if;
if p_attempt > public.billing_auto_max_attempts() then return false; end if;
insert into public.platform_auto_attempts (charge_id, attempt, outcome, last4) values (p_charge, p_attempt, 'iniciada', f.last4);
return true;
end $$;

-- grava o resultado e avisa a casa (aviso em texto simples, sem dado técnico)
create or replace function public.platform_auto_attempt_result(p_charge uuid, p_attempt int, p_outcome text, p_ref text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; a public.platform_auto_attempts; v_owner uuid; v_msg text; v_max int := public.billing_auto_max_attempts();
begin
if p_outcome not in ('aprovada', 'recusada', 'exige_acao', 'processando') then raise exception 'Resultado inválido.'; end if;
select * into c from public.platform_charges where id = p_charge;
if not found then raise exception 'Fatura inexistente.'; end if;
select * into a from public.platform_auto_attempts where charge_id = p_charge and attempt = p_attempt for update;
if not found then raise exception 'Tentativa inexistente.'; end if;
if a.outcome <> 'iniciada' then return; end if; -- já registrada (reenvio): não avisa duas vezes
update public.platform_auto_attempts set outcome = p_outcome, ref = left(p_ref, 200), error_code = left(p_code, 80), updated_at = now() where id = a.id;
select owner_id into v_owner from public.houses where id = c.house_id;
if v_owner is null then return; end if;
v_msg := case
when p_outcome = 'aprovada' then 'Cobramos a fatura da plataforma no cartão final ' || coalesce(a.last4, '') || '. Pagamento confirmado, obrigado!'
when p_outcome in ('recusada', 'exige_acao') and p_attempt < v_max then
case when p_outcome = 'exige_acao' then 'O seu banco pediu uma confirmação extra e não conseguimos cobrar a fatura no cartão final ' || coalesce(a.last4, '') || ' (tentativa ' || p_attempt || ' de ' || v_max || '). Tentaremos de novo amanhã. Você também pode pagar agora ou trocar o cartão.'
else 'Não conseguimos cobrar a fatura no cartão final ' || coalesce(a.last4, '') || ' (tentativa ' || p_attempt || ' de ' || v_max || '). Tentaremos de novo amanhã. Você também pode pagar agora ou trocar o cartão.' end
when p_outcome in ('recusada', 'exige_acao') then 'Não foi possível cobrar a fatura no cartão final ' || coalesce(a.last4, '') || ' depois de ' || v_max || ' tentativas. Pague a fatura por Pix ou cartão, ou troque o cartão, para evitar a suspensão parcial da casa.'
else null end;
if v_msg is not null then insert into public.notifications (user_id, text, href) values (v_owner, v_msg, '/planos'); end if;
end $$;

-- ============ 5) avisos antes do vencimento: com cobrança automática, dizem em qual cartão ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date; f public.house_card_on_file; auto boolean := false;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
select * into f from public.house_card_on_file where house_id = c.house_id;
auto := found and f.auto_enabled and f.method_ref is not null and c.kind in ('plan', 'extra_seat') and c.due_date >= f.saved_on and public.billing_auto_card_enabled()
and not exists (select 1 from public.platform_auto_attempts t where t.charge_id = c.id and t.outcome in ('recusada', 'exige_acao'));
msg := case p_stage
when 'fatura_disponivel' then case when auto then 'Sua fatura da plataforma vence em ' || to_char(c.due_date, 'DD/MM') || ' e será cobrada automaticamente no cartão final ' || coalesce(f.last4, '') || ' nesse dia. Você pode pagar antes ou trocar o cartão em Planos.'
else 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.' end
when 'vespera' then case when auto then 'Amanhã (' || to_char(c.due_date, 'DD/MM') || ') cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '. Confira se o cartão está dentro da validade e com limite.'
else 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').' end
when 'dia_vencimento' then case when auto then 'Hoje cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '.' else 'Sua fatura da plataforma vence hoje.' end
when 'suspensao' then 'Sua casa está com a suspensão parcial: sem vendas novas, campanhas, destaque, impulsionamento e assistente. Pague a fatura para voltar ao normal.'
when 'total_em_breve' then 'Atenção: se a fatura da plataforma continuar em aberto, sua casa será bloqueada por completo em ' || to_char(tol_end + public.billing_total_days() + 1, 'DD/MM') || '. Pague para evitar.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

-- ============ 6) situação do cartão para a tela da casa (nunca devolve referência do provedor) ============
create or replace function public.my_card_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; f public.house_card_on_file;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
select * into f from public.house_card_on_file where house_id = h;
return jsonb_build_object('has_house', true, 'available', public.billing_auto_card_enabled(), 'has_card', f.method_ref is not null,
'brand', f.brand, 'last4', f.last4, 'exp_month', f.exp_month, 'exp_year', f.exp_year, 'auto_enabled', coalesce(f.auto_enabled, false),
'max_attempts', public.billing_auto_max_attempts(),
'last_attempt', (select jsonb_build_object('attempt', t.attempt, 'outcome', t.outcome, 'at', t.updated_at, 'due_date', c.due_date, 'amount_cents', c.amount_cents)
from public.platform_auto_attempts t join public.platform_charges c on c.id = t.charge_id where c.house_id = h order by t.updated_at desc limit 1));
end $$;

-- ============ 7) permissões ============
revoke all on public.house_card_on_file, public.house_card_setups, public.platform_auto_attempts from anon, authenticated;

grant select on public.platform_auto_attempts to authenticated;

revoke all on function public.billing_auto_max_attempts(), public.billing_auto_card_enabled(), public.platform_card_customer(uuid, text, text), public.platform_card_setup_open(uuid, text, text), public.platform_card_save(uuid, text, text, text, text, text, text, int, int), public.platform_card_set_auto(uuid, boolean), public.platform_card_remove(uuid), public.platform_card_get(uuid), public.platform_autocharge_due(timestamptz), public.platform_auto_attempt_begin(uuid, int, timestamptz), public.platform_auto_attempt_result(uuid, int, text, text, text), public.platform_billing_notice(uuid, text), public.my_card_status() from public, anon, authenticated;

grant execute on function public.billing_auto_max_attempts(), public.billing_auto_card_enabled(), public.platform_card_customer(uuid, text, text), public.platform_card_setup_open(uuid, text, text), public.platform_card_save(uuid, text, text, text, text, text, text, int, int), public.platform_card_set_auto(uuid, boolean), public.platform_card_remove(uuid), public.platform_card_get(uuid), public.platform_autocharge_due(timestamptz), public.platform_auto_attempt_begin(uuid, int, timestamptz), public.platform_auto_attempt_result(uuid, int, text, text, text), public.platform_billing_notice(uuid, text) to service_role;

grant execute on function public.my_card_status() to authenticated, service_role;

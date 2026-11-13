-- PASSO 160: 0099_reativacao_por_pagamento — parte 2 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 1b) a cobrança automática do cartão nunca puxa uma fatura de reativação esquecida em aberto ============
create or replace function public.platform_autocharge_due(p_now timestamptz default now())
returns table (charge_id uuid, house_id uuid, attempt int, amount_cents bigint, due_date date, provider text, customer_ref text, method_ref text, last4 text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; a record; n int;
begin
if not public.billing_auto_card_enabled() then return; end if;
for r in
select c.id, c.house_id as hid, c.amount_cents as amt, c.due_date as due, f.provider as prov, f.customer_ref as cust, f.method_ref as meth, f.last4 as l4
from public.platform_charges c join public.house_card_on_file f on f.house_id = c.house_id
where c.status in ('aberta', 'vencida') and c.kind in ('plan', 'extra_seat') and c.idempotency_key not like 'reativacao:%' and f.auto_enabled and f.method_ref is not null and c.due_date >= f.saved_on
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

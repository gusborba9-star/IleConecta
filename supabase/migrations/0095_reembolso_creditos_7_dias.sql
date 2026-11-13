-- Fase 4: reembolso de créditos de IA em até 7 dias (decisão do proprietário, 2026-11-13, conforme orientação jurídica: direito de arrependimento do CDC).
-- Regras: dentro de 7 dias do pagamento a casa pode pedir o reembolso do pacote. Devolve-se o valor proporcional às respostas que AINDA NÃO foram usadas do pacote,
-- pelo preço pago (franquia do mês é gasta primeiro, então só o que saiu do pacote conta como usado). Nada usado = valor integral. A tarifa do provedor NÃO é descontada (a plataforma absorve).
-- Exemplo: pacote de 200 por R$ 49,90, 30 usadas, 170 restantes: 170 x R$ 0,2495 = R$ 42,415, arredondado para R$ 42,42 (meio centavo arredonda para cima, em favor da casa).
-- O saldo restante é retirado antes de pedir o estorno ao provedor (não dá para gastar enquanto devolve); se o provedor recusar de forma definitiva, o saldo volta.
-- Estorno total vira fatura 'estornada'; parcial mantém a fatura 'paga' e registra o estorno no livro-razão (que nunca é alterado nem apagado).
-- Estado de produção antes desta migration: existem só pacotes de teste da casa de teste; nenhum reembolso existe.

-- ============ 1) reembolsos de pacote ============
create table if not exists public.platform_credit_refunds (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
pack_id uuid not null references public.ai_credit_packs(id) on delete restrict,
credits int not null check (credits > 0),
amount_cents bigint not null check (amount_cents > 0),
status text not null default 'pendente' check (status in ('pendente', 'concluido', 'falhou')),
provider text,
provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
error text check (error is null or char_length(error) <= 300),
requested_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
done_at timestamptz
);

create unique index if not exists platform_credit_refunds_one_active on public.platform_credit_refunds (charge_id) where status in ('pendente', 'concluido');

alter table public.platform_credit_refunds enable row level security;

drop policy if exists pcr_read on public.platform_credit_refunds;

create policy pcr_read on public.platform_credit_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

create or replace function public.platform_credit_refunds_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reembolso não pode ser apagado.'; end if;
if old.status <> 'pendente' then raise exception 'Reembolso encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.charge_id is distinct from old.charge_id or new.house_id is distinct from old.house_id or new.pack_id is distinct from old.pack_id
or new.credits is distinct from old.credits or new.amount_cents is distinct from old.amount_cents or new.created_at is distinct from old.created_at then
raise exception 'Valor e pacote do reembolso não podem ser alterados.';
end if;
new.updated_at := now();
return new;
end $$;

drop trigger if exists trg_platform_credit_refunds_guard on public.platform_credit_refunds;

create trigger trg_platform_credit_refunds_guard before update or delete on public.platform_credit_refunds
for each row execute function public.platform_credit_refunds_guard();

-- o saldo do pacote só diminui, exceto na devolução do saldo quando o provedor recusa o estorno (só a função de falha liga essa exceção, dentro da própria transação)
create or replace function public.ai_credit_packs_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Pacote de créditos não pode ser apagado.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.charge_id is distinct from old.charge_id or new.size is distinct from old.size
or new.purchased_at is distinct from old.purchased_at or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
raise exception 'Pacote de créditos não pode ser alterado.';
end if;
if new.remaining > old.remaining and coalesce(current_setting('app.credit_restore', true), '') <> '1' then raise exception 'O saldo do pacote só diminui.'; end if;
return new;
end $$;

-- ============ 2) valor proporcional (inteiro, em centavos, meio centavo para cima, nunca acima do que foi pago) ============
create or replace function public.platform_credit_refund_cents(p_paid bigint, p_remaining int, p_size int) returns bigint
language sql immutable set search_path = public as $$
select least(p_paid, (p_paid * p_remaining * 2 + p_size) / (p_size * 2));
$$;

-- ============ 3) começar o reembolso: valida, retira o saldo e registra (repetir não duplica) ============
create or replace function public.platform_credit_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; pk public.ai_credit_packs; r public.platform_credit_refunds; v_amount bigint; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'credit_pack' or c.status <> 'paga' then raise exception 'Esta compra não pode ser reembolsada.'; end if;
select * into r from public.platform_credit_refunds where charge_id = p_charge and status in ('pendente', 'concluido');
if found then
if r.status = 'concluido' then raise exception 'Esta compra já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'credits', r.credits, 'resume', true);
end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
select * into pk from public.ai_credit_packs where charge_id = p_charge for update;
if not found then raise exception 'Pacote não encontrado.'; end if;
if pk.remaining <= 0 then raise exception 'Todos os créditos deste pacote já foram usados.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
v_amount := public.platform_credit_refund_cents(c.paid_amount_cents, pk.remaining, pk.size);
if v_amount <= 0 then raise exception 'Nada a reembolsar.'; end if;
update public.ai_credit_packs set remaining = 0 where id = pk.id;
insert into public.platform_credit_refunds (charge_id, house_id, pack_id, credits, amount_cents, provider, requested_by)
values (c.id, c.house_id, pk.id, pk.remaining, v_amount, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', v_amount, 'credits', pk.remaining, 'resume', false);
end $$;

-- ============ 4) concluído no provedor: livro-razão, fatura e aviso (repetir não duplica) ============
create or replace function public.platform_credit_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.platform_credit_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.platform_credit_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.platform_credit_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if r.amount_cents >= c.paid_amount_cents and c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: devolvemos o valor de ' || r.credits || ' respostas não usadas do pacote. O dinheiro volta pelo mesmo meio de pagamento em alguns dias, conforme o banco.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

-- ============ 5) recusado de forma definitiva pelo provedor: o saldo volta ============
create or replace function public.platform_credit_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.platform_credit_refunds; v_owner uuid;
begin
select * into r from public.platform_credit_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
update public.platform_credit_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
perform set_config('app.credit_restore', '1', true);
update public.ai_credit_packs set remaining = remaining + r.credits where id = r.pack_id;
perform set_config('app.credit_restore', '0', true);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso agora. Os seus créditos foram devolvidos ao saldo. Tente de novo em instantes ou fale com o suporte.', '/planos');
end if;
end $$;

-- reembolsos que ficaram sem resposta do provedor (rede caiu): a rotina refaz com a mesma chave
create or replace function public.platform_credit_refunds_pending(p_older interval default interval '2 minutes')
returns table (refund_id uuid, provider text, ref text, amount_cents bigint)
language sql stable security definer set search_path = public as $$
select r.id, r.provider, c.paid_ref, r.amount_cents from public.platform_credit_refunds r join public.platform_charges c on c.id = r.charge_id
where r.status = 'pendente' and r.created_at < now() - p_older order by r.created_at limit 20;
$$;

-- ============ 6) tela da casa: o que pode ser reembolsado agora, com o valor ============
create or replace function public.my_credit_refunds() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'items', '[]'::jsonb, 'history', '[]'::jsonb, 'window_days', 7); end if;
return jsonb_build_object('has_house', true, 'window_days', 7,
'items', coalesce((select jsonb_agg(jsonb_build_object('charge_id', c.id, 'size', p.size, 'remaining', p.remaining, 'paid_cents', c.paid_amount_cents,
'refund_cents', public.platform_credit_refund_cents(c.paid_amount_cents, p.remaining, p.size), 'deadline', c.paid_at + interval '7 days') order by c.paid_at)
from public.platform_charges c join public.ai_credit_packs p on p.charge_id = c.id
where c.house_id = h and c.kind = 'credit_pack' and c.status = 'paga' and c.paid_at + interval '7 days' >= now() and p.remaining > 0 and p.expires_at > now()
and not exists (select 1 from public.platform_credit_refunds r where r.charge_id = c.id and r.status in ('pendente', 'concluido'))), '[]'::jsonb),
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'credits', r.credits, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_credit_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 10) r), '[]'::jsonb));
end $$;

-- ============ 7) permissões ============
revoke all on public.platform_credit_refunds from anon, authenticated;

grant select on public.platform_credit_refunds to authenticated;

revoke all on function public.platform_credit_refunds_guard(), public.platform_credit_refund_cents(bigint, int, int), public.platform_credit_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_credit_refund_done(uuid, text, timestamptz),
public.platform_credit_refund_fail(uuid, text), public.platform_credit_refunds_pending(interval), public.my_credit_refunds() from public, anon, authenticated;

grant execute on function public.platform_credit_refund_cents(bigint, int, int), public.platform_credit_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_credit_refund_done(uuid, text, timestamptz),
public.platform_credit_refund_fail(uuid, text), public.platform_credit_refunds_pending(interval) to service_role;

grant execute on function public.my_credit_refunds() to authenticated, service_role;

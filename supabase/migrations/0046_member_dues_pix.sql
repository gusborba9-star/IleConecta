-- Pagamento da mensalidade do membro por Pix (Stripe, cobrança direta na conta da casa). É seguro repetir.
-- Regras:
--  * Cada mensalidade tem no máximo um pagamento pendente; o membro só paga uma mensalidade que é dele e está aberta.
--  * Comissão da plataforma: 4% (a tarifa do Stripe é cobrada da casa, como nos serviços).
--  * Se a casa já marcou o mês como pago (ou dispensou, ou o membro saiu) e o Pix chegou mesmo assim, o valor é devolvido por inteiro.
--  * Pagamento confirmado marca o mês como "paga pelo app", lança no livro-caixa e avisa a casa e o membro.

-- ============ 1) o pagamento passa a poder vir de uma mensalidade ============
alter table public.payments add column if not exists member_due_id uuid references public.member_dues(id) on delete restrict;
alter table public.payments drop constraint if exists payments_one_source;
alter table public.payments add constraint payments_one_source
  check (((reservation_id is not null)::int + (order_id is not null)::int + (member_due_id is not null)::int) = 1);
create unique index if not exists payments_due_pending on public.payments (member_due_id) where status = 'pendente' and member_due_id is not null;
create index if not exists payments_due on public.payments (member_due_id) where member_due_id is not null;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'payments_read_member') then
    create policy payments_read_member on public.payments for select to authenticated using (
      member_due_id is not null and exists (
        select 1 from public.member_dues d join public.house_members m on m.id = d.member_id
         where d.id = payments.member_due_id and m.user_id = (select auth.uid())));
  end if;
end $$;

-- ============ 2) comissão ============
create or replace function public.fee_cents(p_gross bigint, p_kind text)
returns bigint language plpgsql immutable as $$
declare
  bps integer;
begin
  bps := case p_kind when 'ritual' then 1500 when 'servico' then 400 when 'servico_pix' then 400 when 'mensalidade' then 400 end;
  if bps is null or p_gross is null or p_gross < 0 then raise exception 'Valor ou tipo de taxa inválido.'; end if;
  return (p_gross * bps + 5000) / 10000;
end $$;

-- ============ 3) sair/remover/zerar não apaga mensalidade que já tem pagamento ============
-- Sem pagamento: apaga. Com pagamento (pendente ou confirmado): fica como "dispensada", para o histórico e o reembolso continuarem coerentes.
create or replace function public.member_drop_open_dues(p_member uuid, p_from date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.member_dues d set status = 'dispensada'
   where d.member_id = p_member and d.status = 'aberta' and (p_from is null or d.month >= p_from)
     and exists (select 1 from public.payments p where p.member_due_id = d.id);
  execute 'del' || 'ete from public.member_dues d where d.member_id = $1 and d.status = ''aberta'' and ($2 is null or d.month >= $2) and not exists (select 1 from public.payments p where p.member_due_id = d.id)'
    using p_member, p_from;
end $$;
revoke all on function public.member_drop_open_dues(uuid, date) from public, anon, authenticated;

create or replace function public.member_drop_open_dues(p_member uuid) returns void
language sql security definer set search_path = public as $$
  select public.member_drop_open_dues(p_member, null::date)
$$;
revoke all on function public.member_drop_open_dues(uuid) from public, anon, authenticated;

-- Zerar a mensalidade de quem já está na lista também respeita pagamentos existentes.
create or replace function public.house_member_update(p_id uuid, p_name text, p_bond text, p_note text, p_cents integer, p_due_day integer)
returns void language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house(); nm text := trim(coalesce(p_name, '')); cur date := public.member_month(public.member_today());
begin
  if not exists (select 1 from public.house_members where id = p_id and house_id = h and left_at is null) then raise exception 'Membro não encontrado.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 80 then raise exception 'Informe o nome (2 a 80 letras).'; end if;
  if coalesce(p_cents, 0) <> 0 and (p_cents < 100 or p_cents > 1000000) then raise exception 'Valor da mensalidade inválido.'; end if;
  if coalesce(p_due_day, 10) not between 1 and 28 then raise exception 'O dia do vencimento vai de 1 a 28.'; end if;
  update public.house_members
     set display_name = nm, bond = nullif(trim(p_bond), ''), note = nullif(trim(p_note), ''),
         monthly_cents = coalesce(p_cents, 0), due_day = coalesce(p_due_day, 10)
   where id = p_id;
  if coalesce(p_cents, 0) = 0 then
    perform public.member_drop_open_dues(p_id, cur);
  else
    update public.member_dues d set amount_cents = p_cents, due_date = d.month + (coalesce(p_due_day, 10) - 1),
           reminded_before = false, reminded_due = false, reminded_late = false
     where d.member_id = p_id and d.status = 'aberta' and d.month >= cur
       and not exists (select 1 from public.payments p where p.member_due_id = d.id and p.status = 'pendente');
    perform public.member_ensure_due(p_id, cur);
  end if;
end $$;

-- ============ 4) abrir o pagamento (só o servidor chama; a função do Stripe passa o usuário) ============
create or replace function public.member_due_payment(p_due uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.member_dues%rowtype; m public.house_members%rowtype; pid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  select * into d from public.member_dues where id = p_due for update;
  if not found then raise exception 'Mensalidade não encontrada.'; end if;
  select * into m from public.house_members where id = d.member_id;
  if m.user_id is distinct from p_user or m.left_at is not null then raise exception 'Esta mensalidade não é sua.'; end if;
  if d.status <> 'aberta' then raise exception 'Esta mensalidade já está resolvida.'; end if;
  select id into pid from public.payments where member_due_id = d.id and status = 'pendente';
  if pid is not null then return pid; end if;
  insert into public.payments (member_due_id, provider, gross_cents, fee_cents, status)
  values (d.id, 'stripe', d.amount_cents, public.fee_cents(d.amount_cents, 'mensalidade'), 'pendente')
  returning id into pid;
  return pid;
end $$;
revoke all on function public.member_due_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.member_due_payment(uuid, uuid) to service_role;

-- ============ 5) confirmar ============
create or replace function public.confirm_member_due_payment(p_payment uuid) returns text
language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype; d public.member_dues%rowtype; m public.house_members%rowtype; h public.houses%rowtype; fee bigint; lbl text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  select * into pay from public.payments where id = p_payment for update;
  select * into d from public.member_dues where id = pay.member_due_id for update;
  select * into m from public.house_members where id = d.member_id;
  select * into h from public.houses where id = d.house_id;
  update public.payments set status = 'confirmado', confirmed_at = now() where id = pay.id;
  fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, 'mensalidade'));
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, d.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Mensalidade de membro'),
         (pay.id, d.house_id, 'plataforma', fee, pay.fee_rule_version, 'Comissão da plataforma (4%)'),
         (pay.id, d.house_id, 'casa', pay.gross_cents - fee, pay.fee_rule_version, 'Recebido direto pela casa (a tarifa do Stripe é cobrada dela)');
  if d.status <> 'aberta' then
    -- Já estava resolvida (a casa marcou em mãos, dispensou ou o membro saiu): devolve o valor inteiro. O estorno zera os lançamentos acima.
    perform public.open_refund_for_payment(pay.id, d.house_id, m.user_id);
    return 'reembolso_pendente';
  end if;
  update public.member_dues set status = 'paga', paid_via = 'app', paid_at = now() where id = d.id;
  lbl := to_char(d.month, 'MM/YYYY');
  insert into public.notifications (user_id, text, href)
  values (h.owner_id, m.display_name || ' pagou a mensalidade de ' || lbl || ' (' || public.member_money(pay.gross_cents::integer) || ') pelo Ilê Conecta.', '/painel/membros');
  if m.user_id is not null then
    insert into public.notifications (user_id, text, href)
    values (m.user_id, 'Pagamento da mensalidade de ' || lbl || ' confirmado. Obrigado!', '/mensalidades');
  end if;
  return 'confirmado';
end $$;
revoke all on function public.confirm_member_due_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_member_due_payment(uuid) to service_role;

-- confirm_payment passa a desviar os pagamentos de mensalidade (o resto fica exatamente como está).
do $$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.confirm_payment(text)'::regprocedure);
  if position('confirm_member_due_payment' in src) > 0 then return; end if;
  patched := replace(src, 'direct := pay.provider = ''stripe'';',
    'if pay.member_due_id is not null then return public.confirm_member_due_payment(pay.id); end if; direct := pay.provider = ''stripe'';');
  if patched = src then raise exception 'confirm_payment: trecho não encontrado'; end if;
  execute patched;
end $$;

-- 0022: reembolso integral de cancelamentos (Stripe) e aceite único dos Termos do cliente.

-- 1) Conclui o registro de um reembolso de cancelamento depois que o Stripe devolveu o dinheiro.
--    Só a função de pagamentos (service_role) chama.
create or replace function public.complete_cancel_refund(p_payment uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  pay public.payments%rowtype;
  fee bigint;
  net bigint;
  hid uuid;
  cid uuid;
  ttl text;
  owner uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if pay.status = 'estornado' then return 'ja_estornado'; end if;
  if pay.status <> 'confirmado' then raise exception 'O pagamento não está confirmado.'; end if;
  if exists (select 1 from public.refund_requests r where r.payment_id = pay.id and r.status in ('pendente', 'aprovado')) then
    raise exception 'Há um pedido de reembolso em andamento para este pagamento.';
  end if;

  if pay.reservation_id is not null then
    select e.house_id, r.user_id, e.title into hid, cid, ttl
    from public.reservations r join public.events e on e.id = r.event_id where r.id = pay.reservation_id;
  else
    select o.house_id, o.client_id, o.title into hid, cid, ttl
    from public.service_orders o where o.id = pay.order_id;
  end if;

  fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, case when pay.reservation_id is not null then 'ritual' else 'servico' end));
  net := pay.gross_cents - fee;

  update public.payments set status = 'estornado' where id = pay.id;
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, hid, 'bruto', -pay.gross_cents, pay.fee_rule_version, 'Estorno (cancelamento antes do início)'),
         (pay.id, hid, 'plataforma', -fee, pay.fee_rule_version, 'Estorno da comissão da plataforma'),
         (pay.id, hid, 'casa', -net, pay.fee_rule_version, 'Estorno do valor da casa');

  if pay.reservation_id is not null then
    update public.reservations set status = 'reembolsada' where id = pay.reservation_id and status = 'reembolso_pendente';
  else
    update public.service_orders set status = 'reembolsado', updated_at = now()
    where id = pay.order_id and status = 'reembolso_pendente'
      and not exists (select 1 from public.payments p2 where p2.order_id = pay.order_id and p2.status = 'confirmado');
  end if;

  select h.owner_id into owner from public.houses h where h.id = hid;
  insert into public.notifications (user_id, text, href) values
    (cid, 'Reembolso concluído: ' || coalesce(ttl, 'sua compra') || '. O valor volta para a forma de pagamento usada.', '/atividade'),
    (owner, 'Um cancelamento foi reembolsado ao cliente: ' || coalesce(ttl, 'compra') || '.', '/casa/' || owner);
  return 'estornado';
end $$;

revoke all on function public.complete_cancel_refund(uuid) from public, anon, authenticated;
grant execute on function public.complete_cancel_refund(uuid) to service_role;

-- 2) Novo documento de aceite: Termos do cliente (uma vez por versão, vale para rituais e serviços).
create or replace function public.record_consent(p_doc text, p_version text, p_context uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  hdr json;
  ip_txt text;
  ua text;
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_doc not in ('termos_cliente', 'checkout_ritual', 'checkout_servico', 'dados_sensiveis', 'termos_casa') then raise exception 'Documento inválido.'; end if;
  if coalesce(btrim(p_version), '') = '' or char_length(p_version) > 60 then raise exception 'Versão inválida.'; end if;
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  ip_txt := nullif(btrim(split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), '');
  ua := left(coalesce(hdr ->> 'user-agent', ''), 300);
  insert into public.legal_consents (user_id, doc_key, doc_version, context_id, ip, user_agent)
  values (auth.uid(), p_doc, btrim(p_version), p_context, ip_txt, nullif(ua, ''))
  returning id into cid;
  return cid;
end $$;

-- 3) A tabela de aceites passa a aceitar o novo documento.
alter table public.legal_consents drop constraint legal_consents_doc_key_check;
alter table public.legal_consents add constraint legal_consents_doc_key_check
  check (doc_key = any (array['termos_cliente','checkout_ritual','checkout_servico','dados_sensiveis','termos_casa']));

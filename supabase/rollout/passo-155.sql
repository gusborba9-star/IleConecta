-- PASSO 155: 0098_reembolso_plano_7_dias — parte 9 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) recusado de forma definitiva pelo provedor: nada muda na assinatura ============
create or replace function public.platform_plan_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.platform_plan_refunds; v_owner uuid;
begin
select * into r from public.platform_plan_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
update public.platform_plan_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso do plano agora. A sua assinatura continua ativa. Tente de novo em instantes ou fale com o suporte.', '/planos');
end if;
end $$;

-- reembolsos de plano que ficaram sem resposta do provedor (rede caiu): a rotina refaz com a mesma chave
create or replace function public.platform_plan_refunds_pending(p_older interval default interval '2 minutes')
returns table (refund_id uuid, provider text, ref text, amount_cents bigint)
language sql stable security definer set search_path = public as $$
select r.id, r.provider, c.paid_ref, r.amount_cents from public.platform_plan_refunds r join public.platform_charges c on c.id = r.charge_id
where r.status = 'pendente' and r.created_at < now() - p_older order by r.created_at limit 20;
$$;

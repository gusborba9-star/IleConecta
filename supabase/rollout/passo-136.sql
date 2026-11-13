-- PASSO 136: 0095_reembolso_creditos_7_dias — parte 8 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

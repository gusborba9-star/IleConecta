-- PASSO 157: 0098_reembolso_plano_7_dias — parte 11 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.admin_billing_reactivate(p_house uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
update public.house_billing_state set cancelled_at = null, updated_at = now() where house_id = p_house and cancelled_at is not null;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_reactivate', null, jsonb_build_object('house', p_house, 'reason', left(btrim(p_reason), 300)));
perform public.platform_house_billing_recompute(p_house);
end $$;

-- ============ 7) permissões ============
revoke all on public.platform_plan_refunds from anon, authenticated;

grant select on public.platform_plan_refunds to authenticated;

revoke all on function public.platform_plan_refunds_guard(), public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_plan_refund_done(uuid, text, timestamptz),
public.platform_plan_refund_fail(uuid, text), public.platform_plan_refunds_pending(interval), public.my_plan_refund(), public.admin_billing_reactivate(uuid, text) from public, anon, authenticated;

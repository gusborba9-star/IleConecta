-- PASSO 197: 0106_conta_reutilizada — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) permissões ============
revoke all on function public.email_key(text), public.account_prior_deleted(uuid), public.house_owner_refund_used_before(uuid),
  public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.my_plan_refund(),
  public.admin_returning_accounts(), public.admin_returning_history(uuid, text), public.admin_notify_returning(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.email_key(text), public.account_prior_deleted(uuid), public.house_owner_refund_used_before(uuid),
  public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz) to service_role;

grant execute on function public.my_plan_refund() to authenticated, service_role;

grant execute on function public.admin_returning_accounts(), public.admin_returning_history(uuid, text), public.admin_notify_returning(uuid, text, text, text) to authenticated, service_role;

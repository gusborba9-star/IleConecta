-- PASSO 55: 0079_ferramentas_de_conta — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) permissões ============
revoke all on function public.support_contact_email(), public.admin_set_support_email(text, text), public.admin_suspend_account(uuid, text, uuid), public.admin_unsuspend_account(uuid, text),
  public.export_my_data(), public.my_account_status(), public.request_account_deletion(text), public.cancel_account_deletion(), public.admin_decide_account_deletion(uuid, text, text),
  public.account_deletions_due(), public.account_files(uuid), public.anonymize_account(uuid, uuid), public.reject_suspended_actor() from public, anon, authenticated;

grant execute on function public.support_contact_email() to anon, authenticated;

grant execute on function public.admin_set_support_email(text, text), public.admin_suspend_account(uuid, text, uuid), public.admin_unsuspend_account(uuid, text),
  public.export_my_data(), public.my_account_status(), public.request_account_deletion(text), public.cancel_account_deletion(), public.admin_decide_account_deletion(uuid, text, text) to authenticated;

grant execute on function public.account_deletions_due(), public.account_files(uuid), public.anonymize_account(uuid, uuid) to service_role;

-- PASSO 192: 0105_exclusao_conta_pendencias_financeiras — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) permissões ============
revoke all on function public.account_deletion_money_blockers(uuid), public.account_deletion_blockers(uuid), public.provider_cleanup_list(integer),
  public.provider_cleanup_mark(uuid, boolean, text), public.anonymize_account_and_queue(uuid, uuid) from public, anon, authenticated;

grant execute on function public.account_deletion_money_blockers(uuid), public.account_deletion_blockers(uuid), public.provider_cleanup_list(integer),
  public.provider_cleanup_mark(uuid, boolean, text), public.anonymize_account_and_queue(uuid, uuid) to service_role;

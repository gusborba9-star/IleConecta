-- PASSO 207: 0108_contratacao_de_plano_no_app — parte 8 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) permissões ============
revoke all on function public.platform_plan_rank(text), public.platform_plan_change_block_reason(uuid, date), public.platform_upgrade_quote(uuid, text, date), public.platform_upgrade_issue(uuid, text, timestamptz),
  public.platform_house_upgraded_by_payment(), public.platform_subscribe_issue(uuid, text, timestamptz), public.platform_house_subscribed_by_payment(), public.platform_plan_pending_apply_due(timestamptz),
  public.my_plan_change_schedule(text), public.my_plan_change_undo(), public.my_plan_change_status() from public, anon, authenticated;

grant execute on function public.platform_upgrade_issue(uuid, text, timestamptz), public.platform_subscribe_issue(uuid, text, timestamptz), public.platform_plan_pending_apply_due(timestamptz) to service_role;

grant execute on function public.my_plan_change_schedule(text), public.my_plan_change_undo(), public.my_plan_change_status() to authenticated, service_role;

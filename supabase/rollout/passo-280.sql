-- PASSO 280: 0129_central_de_pendencias_admin — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) permissões ============
revoke all on function public.admin_reported_reviews(), public.report_review(uuid,text), public.pending_deadline_hours(text), public.admin_pending_center(), public.admin_review_report_keep(uuid) from public, anon, authenticated;

grant execute on function public.pending_deadline_hours(text) to service_role;

grant execute on function public.admin_reported_reviews(), public.report_review(uuid,text), public.admin_pending_center(), public.admin_review_report_keep(uuid) to authenticated;

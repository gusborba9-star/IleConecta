-- PASSO 241: 0116_feed_publicacoes_e_resultados — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) permissões ============
revoke all on public.promo_stats, public.promo_events from anon, authenticated;

revoke all on function public.promo_track(uuid[], text) from public, anon, authenticated;

grant execute on function public.promo_track(uuid[], text) to authenticated, service_role;

revoke all on function public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean), public.promotions_tick(timestamptz) from public, anon, authenticated;

grant execute on function public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean), public.promotions_tick(timestamptz) to service_role;

revoke all on function public.promotions_visible(), public.my_promotions() from public, anon, authenticated;

grant execute on function public.promotions_visible() to anon, authenticated, service_role;

grant execute on function public.my_promotions() to authenticated, service_role;

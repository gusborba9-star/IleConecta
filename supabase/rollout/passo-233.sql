-- PASSO 233: fecha o acesso de visitantes sem login às funções da casa
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
revoke all on function public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.my_promotions(), public.admin_set_promo_limit(text, int, text), public.promotions_visible() from public, anon, authenticated;

grant execute on function public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.my_promotions(), public.admin_set_promo_limit(text, int, text) to authenticated, service_role;

grant execute on function public.promotions_visible() to anon, authenticated, service_role;

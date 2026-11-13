-- PASSO 146: 0097_aviso_termos_e_leitura — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) permissões ============
revoke all on function public.notifications_read_at(), public.platform_announce(text, text) from public, anon, authenticated;

grant execute on function public.platform_announce(text, text) to service_role;

-- PASSO 295: 0135_central_da_casa_pessoa_exata — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
revoke all on function public.house_pending_center() from public, anon, authenticated;

grant execute on function public.house_pending_center() to authenticated;

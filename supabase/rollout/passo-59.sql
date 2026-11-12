-- PASSO 59: 0082_endurece_log_de_suporte — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
alter function public.support_log_immutable() set search_path = public;

revoke all on function public.support_log_immutable() from public, anon, authenticated;

-- PASSO 283: 0130_central_de_pendencias_casa — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
revoke all on function public.house_pending_hours(text), public.house_pending_center() from public, anon, authenticated;

grant execute on function public.house_pending_hours(text) to service_role;

grant execute on function public.house_pending_center() to authenticated;

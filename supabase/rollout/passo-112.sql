-- PASSO 112: 0092_planos_e_foto_da_assistente — parte 4 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) permissões ============
revoke all on function public.assistants_avatar_guard(), public.assistant_avatar_path(uuid) from public, anon, authenticated;

grant execute on function public.assistant_avatar_path(uuid) to authenticated;

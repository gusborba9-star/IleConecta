-- PASSO 299: 0138_modulos_de_acesso_da_administracao — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
grant execute on function public.admin_list_admins() to authenticated;

grant execute on function public.admin_add_admin(text, text[]) to authenticated;

grant execute on function public.admin_set_admin_perms(uuid, text[]) to authenticated;

grant execute on function public.admin_remove_admin(uuid) to authenticated;

-- PASSO 257: 0122_aviso_geral_pela_administracao — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) Histórico
create or replace function public.admin_announcements_list()
returns table (id uuid, text text, href text, audience text, recipients integer, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select a.id, a.text, a.href, a.audience, a.recipients, a.created_at from public.admin_announcements a order by a.created_at desc limit 30;
end $$;

-- ============ 6) Permissões
revoke all on function public.admin_announce_count(text), public.admin_search_recipients(text), public.admin_announce(text, text, text, uuid[]), public.admin_announcements_list() from public, anon;

grant execute on function public.admin_announce_count(text), public.admin_search_recipients(text), public.admin_announce(text, text, text, uuid[]), public.admin_announcements_list() to authenticated;

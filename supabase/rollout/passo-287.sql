-- PASSO 287: 0131_pessoas_da_casa — parte 4 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) permissões ============
revoke all on function public.house_people_base(uuid, uuid, boolean, boolean, boolean, boolean), public.house_people_ctx(), public.house_people(text, text, integer, integer), public.house_person_timeline(uuid, integer) from public, anon, authenticated;

grant execute on function public.house_people(text, text, integer, integer), public.house_person_timeline(uuid, integer) to authenticated;

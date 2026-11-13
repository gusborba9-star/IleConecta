-- PASSO 145: 0097_aviso_termos_e_leitura — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) aviso geral: uma notificação por pessoa, sem repetir ============
create or replace function public.platform_announce(p_text text, p_href text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
if coalesce(char_length(btrim(p_text)), 0) < 10 or char_length(p_text) > 400 then raise exception 'Texto do aviso inválido.'; end if;
if p_href is not null and p_href !~ '^/([A-Za-z0-9_?=&#.-][A-Za-z0-9/_?=&#.-]{0,199})?$' then raise exception 'Endereço do aviso inválido.'; end if;
insert into public.notifications (user_id, text, href)
select p.id, btrim(p_text), p_href from public.profiles p
where not exists (select 1 from public.notifications x where x.user_id = p.id and x.text = btrim(p_text));
get diagnostics n = row_count;
return n;
end $$;

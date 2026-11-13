-- PASSO 185: 0101_cancelamento_e_tela_unica — parte 11 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) estado da conta para a tela única (dono ou equipe da casa) ============
create or replace function public.my_account_gate() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; nm text; r text;
begin
if me is null or public.is_admin() then return jsonb_build_object('state', 'ok'); end if;
select id, name into h, nm from public.houses where owner_id = me limit 1;
if h is not null then
r := 'dono';
else
select s.house_id into h from public.staff_row() s limit 1;
if h is not null then
r := 'equipe';
select name into nm from public.houses where id = h;
end if;
end if;
if h is null or public.house_billing_level(h) <> 'total' then return jsonb_build_object('state', 'ok'); end if;
return jsonb_build_object('state', case when coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false) then 'inativa' else 'bloqueada' end, 'role', r, 'house_id', h, 'house_name', nm);
end $$;

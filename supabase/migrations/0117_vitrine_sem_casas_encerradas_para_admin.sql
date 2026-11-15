-- 0117 — A vitrine (descobrir casas) não lista casa encerrada ou bloqueada nem para quem consegue enxergá-la por outro motivo
-- (administrador, equipe da casa, cliente com pedido em andamento). Elas continuam acessíveis pelos caminhos próprios (painel, pedidos).
-- A função só devolve casas que a própria pessoa já consegue ler, então não revela nada novo.
create or replace function public.vitrine_hidden_house_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
select coalesce(array_agg(h.id), '{}'::uuid[]) from public.houses h
where auth.uid() is not null and h.owner_id is distinct from auth.uid() and public.house_is_hidden(h.id) and public.house_visible_to_me(h.id);
$$;

revoke all on function public.vitrine_hidden_house_ids() from public, anon, authenticated;
grant execute on function public.vitrine_hidden_house_ids() to authenticated, service_role;

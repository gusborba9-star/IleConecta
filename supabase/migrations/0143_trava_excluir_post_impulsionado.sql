-- 0143 — Excluir publicação (pedido do proprietário, 17/11/2026): a casa passa a poder excluir os próprios posts pela tela.
-- Trava de dinheiro: publicação com impulsionamento pago em andamento (aguardando ou ativo) NÃO pode ser excluída; senão a casa continuaria pagando
-- dias de um impulsionamento que não aparece mais (regra de 0116: impulsionamento de post some se o post some). A casa exclui depois que ele encerrar.
-- Só vale para quem usa o app (casa logada). Exclusão em cascata (conta apagada) e o SQL da administração não são afetados.
create or replace function public.posts_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then return old; end if;
  if exists (select 1 from public.promotions p where p.item_type = 'post' and p.item_id = old.id and p.status in ('aguardando', 'ativa')) then
    raise exception 'Esta publicação está impulsionada. Você poderá excluí-la quando o impulsionamento terminar.';
  end if;
  return old;
end $$;

revoke execute on function public.posts_delete_guard() from public, anon, authenticated;

drop trigger if exists posts_delete_guard on public.posts;

create trigger posts_delete_guard before delete on public.posts for each row execute function public.posts_delete_guard();

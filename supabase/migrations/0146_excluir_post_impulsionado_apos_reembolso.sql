-- 0146 — Excluir publicação impulsionada depois do reembolso (decisão do proprietário, 17/11/2026).
-- Antes (0143): post com impulsionamento pago aguardando ou ativo nunca podia ser excluído. Agora existe um caminho honesto e já previsto na plataforma:
-- dentro dos 7 dias da compra a casa pede o reembolso dos dias que ainda não começaram (Pedidos e validações); concluído o reembolso, a casa pode excluir
-- e os dias que já tinham começado (pagos, não devolvidos) simplesmente param, porque o impulsionamento só aparece enquanto a publicação existe (0116).
-- Estados de uma publicação, numa regra só (post_text_lock_state da 0145 é outra coisa): livre | reembolsavel | reembolso_pendente | liberado | aguardar.
-- Só vale para quem usa o app; cascata de conta apagada e SQL da administração continuam livres.

create or replace function public.post_delete_state(p_post uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.promotions p where p.item_type = 'post' and p.item_id = p_post and p.status in ('aguardando', 'ativa')) then return 'livre'; end if;
  if exists (select 1 from public.promotions p join public.promo_refunds r on r.promotion_id = p.id
             where p.item_type = 'post' and p.item_id = p_post and p.status in ('aguardando', 'ativa') and r.status = 'pendente') then return 'reembolso_pendente'; end if;
  -- todo impulsionamento em andamento já teve o reembolso concluído: sobram só os dias que já começaram (pagos, não devolvidos)
  if not exists (select 1 from public.promotions p where p.item_type = 'post' and p.item_id = p_post and p.status in ('aguardando', 'ativa')
                 and not exists (select 1 from public.promo_refunds r where r.promotion_id = p.id and r.status = 'concluido')) then return 'liberado'; end if;
  if exists (select 1 from public.promotions p join public.platform_charges c on c.id = p.charge_id
             where p.item_type = 'post' and p.item_id = p_post and p.status = 'ativa' and c.status = 'paga' and c.paid_at is not null
               and now() <= c.paid_at + interval '7 days' and public.promo_blocks_started(p, now()) < p.days
               and not exists (select 1 from public.promo_refunds r where r.promotion_id = p.id and r.status = 'concluido')) then return 'reembolsavel'; end if;
  return 'aguardar';
end $$;

revoke execute on function public.post_delete_state(uuid) from public, anon, authenticated;

-- a tela pergunta pelos posts da própria casa que estão impulsionados e o que a casa pode fazer
create or replace function public.my_post_delete_states() returns table (post_id uuid, state text, deadline timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, x.st,
    case when x.st = 'reembolsavel' then (select min(c.paid_at + interval '7 days') from public.promotions p join public.platform_charges c on c.id = p.charge_id
      where p.item_type = 'post' and p.item_id = x.id and p.status = 'ativa' and c.status = 'paga' and c.paid_at is not null) end
  from (
    select po.id, public.post_delete_state(po.id) st
    from public.posts po join public.houses h on h.id = po.house_id
    where h.owner_id = (select auth.uid())
      and exists (select 1 from public.promotions p where p.item_type = 'post' and p.item_id = po.id and p.status in ('aguardando', 'ativa'))
  ) x;
$$;

revoke all on function public.my_post_delete_states() from public, anon;

grant execute on function public.my_post_delete_states() to authenticated;

-- a trava de excluir (substitui a da 0143): libera quando só restam dias já iniciados e encerra esses impulsionamentos junto
create or replace function public.posts_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then return old; end if;
  v := public.post_delete_state(old.id);
  if v = 'livre' then return old; end if;
  if v = 'liberado' then
    update public.promotions set status = 'encerrada' where item_type = 'post' and item_id = old.id and status in ('aguardando', 'ativa');
    return old;
  end if;
  if v = 'reembolso_pendente' then
    raise exception 'O reembolso desta publicação ainda está sendo concluído. Tente excluir em alguns minutos.';
  end if;
  raise exception 'Esta publicação está impulsionada. Você poderá excluí-la quando o impulsionamento terminar.';
end $$;

revoke execute on function public.posts_delete_guard() from public, anon, authenticated;

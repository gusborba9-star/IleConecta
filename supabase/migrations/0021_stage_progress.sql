-- Acompanhamento das etapas de pagamento de um serviço: quantas já foram pagas e lembrete da casa ao cliente.
-- A casa decide quando começar e concluir; as etapas seguintes podem ficar para dias depois (combinado entre casa e cliente).
-- Rode no SQL Editor. É seguro repetir.

alter table public.service_orders add column if not exists stage_reminded_at timestamptz;

-- Etapas pagas por pedido, só para quem enxerga o pedido (o cliente e a casa dona).
create or replace function public.order_stage_progress(p_orders uuid[])
returns table (order_id uuid, paid integer)
language sql stable security definer set search_path = public as $$
  select o.id, (select count(*)::integer from public.payments p where p.order_id = o.id and p.status = 'confirmado')
    from public.service_orders o
   where o.id = any (coalesce(p_orders, '{}'::uuid[]))
     and (o.client_id = auth.uid() or public.is_house_owner(o.house_id))
$$;
revoke all on function public.order_stage_progress(uuid[]) from public, anon;
grant execute on function public.order_stage_progress(uuid[]) to authenticated;

-- A casa lembra o cliente da próxima etapa (um aviso por dia, no máximo).
create or replace function public.remind_next_stage(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  hname text;
  owner uuid;
  done integer;
begin
  select * into o from public.service_orders where id = p_order for update;
  if not found or not public.is_house_owner(o.house_id) then raise exception 'Pedido não encontrado.'; end if;
  if o.stages_total < 2 or o.status not in ('confirmado', 'em_andamento', 'concluido') then
    raise exception 'Este pedido não tem etapa para lembrar.';
  end if;
  select count(*)::integer into done from public.payments p where p.order_id = o.id and p.status = 'confirmado';
  if done >= o.stages_total then raise exception 'Todas as etapas deste pedido já foram pagas.'; end if;
  if o.stage_reminded_at is not null and o.stage_reminded_at > now() - interval '24 hours' then
    raise exception 'O cliente já foi lembrado nas últimas 24 horas.';
  end if;
  update public.service_orders set stage_reminded_at = now() where id = o.id;
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = o.house_id;
  insert into public.notifications (user_id, text, href)
  values (o.client_id, 'Próxima etapa de ' || o.title || ' (' || (done + 1) || ' de ' || o.stages_total || '): ' || hname || ' lembra do pagamento combinado.', '/casa/' || owner || '?aba=servicos');
end $$;
revoke all on function public.remind_next_stage(uuid) from public, anon;
grant execute on function public.remind_next_stage(uuid) to authenticated;

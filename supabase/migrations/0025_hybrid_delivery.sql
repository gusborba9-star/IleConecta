-- Serviços híbridos: a casa realiza presencialmente ou à distância; o cliente escolhe ao contratar.
alter type public.service_delivery add value if not exists 'hibrido';

alter table public.service_orders
  add column if not exists modality text check (modality in ('presencial', 'distancia'));

-- O cliente informa como quer receber (só em serviços híbridos, enquanto o pedido está aberto).
create or replace function public.set_order_modality(p_order uuid, p_modality text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  d text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_modality not in ('presencial', 'distancia') then raise exception 'Escolha presencial ou à distância.'; end if;
  select * into o from public.service_orders where id = p_order;
  if not found or o.client_id <> auth.uid() then raise exception 'Pedido não encontrado.'; end if;
  if o.status not in ('aguardando_pagamento', 'confirmado') then raise exception 'Este pedido não pode mais ser alterado.'; end if;
  select s.delivery::text into d from public.services s where s.id = o.service_id;
  if d is distinct from 'hibrido' then raise exception 'Este serviço não tem opção de modalidade.'; end if;
  update public.service_orders set modality = p_modality where id = p_order;
end $$;
revoke all on function public.set_order_modality(uuid, text) from public, anon;
grant execute on function public.set_order_modality(uuid, text) to authenticated;

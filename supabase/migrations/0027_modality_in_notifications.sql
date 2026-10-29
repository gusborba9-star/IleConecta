-- A notificação do pedido mostra a modalidade (presencial ou à distância) quando o serviço é híbrido.

-- 1) Pedido pago: confirm_payment passa a incluir a modalidade no texto.
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'confirm_payment';
  if def not like '%ord.modality%' then
    def := replace(def, '''Novo pedido pago: '' || ord.title || suffix ||',
      '''Novo pedido pago: '' || ord.title || suffix || coalesce('' ('' || case ord.modality when ''presencial'' then ''presencial'' when ''distancia'' then ''à distância'' end || '')'', '''') ||');
    execute def;
  end if;
end $$;

-- 2) Pedido sem pagamento online: a notificação já saiu na criação; acrescenta a modalidade logo depois de escolhida.
create or replace function public.set_order_modality(p_order uuid, p_modality text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  d text;
  owner uuid;
  label text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_modality not in ('presencial', 'distancia') then raise exception 'Escolha presencial ou à distância.'; end if;
  select * into o from public.service_orders where id = p_order;
  if not found or o.client_id <> auth.uid() then raise exception 'Pedido não encontrado.'; end if;
  if o.status not in ('aguardando_pagamento', 'confirmado') then raise exception 'Este pedido não pode mais ser alterado.'; end if;
  select s.delivery::text into d from public.services s where s.id = o.service_id;
  if d is distinct from 'hibrido' then raise exception 'Este serviço não tem opção de modalidade.'; end if;
  update public.service_orders set modality = p_modality where id = p_order;

  if o.status = 'confirmado' and o.modality is null then
    select h.owner_id into owner from public.houses h where h.id = o.house_id;
    label := case p_modality when 'presencial' then 'presencial' else 'à distância' end;
    update public.notifications n set text = regexp_replace(n.text, ' — de ', ' (' || label || ') — de ')
     where n.id = (select n2.id from public.notifications n2
                    where n2.user_id = owner and n2.text like 'Novo pedido: ' || o.title || ' — de %'
                      and n2.created_at > now() - interval '5 minutes'
                    order by n2.created_at desc limit 1);
  end if;
end $$;

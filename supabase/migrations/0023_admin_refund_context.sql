-- Contexto de um pedido de reembolso aberto, para a administração decidir com base em fatos.
-- Só a administração chama; só pedidos em aberto; mensagens limitadas ao período do pedido; cada consulta fica registrada.
create table if not exists public.admin_case_access (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  refund_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.admin_case_access enable row level security;
revoke all on public.admin_case_access from anon, authenticated;

create or replace function public.admin_refund_context(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rr public.refund_requests%rowtype;
  o public.service_orders%rowtype;
  res public.reservations%rowtype;
  ev public.events%rowtype;
  svc_desc text;
  h_name text; h_owner uuid; c_name text;
  conv uuid;
  since timestamptz;
  timeline jsonb := '[]'::jsonb;
  msgs jsonb := '[]'::jsonb;
  v_title text; v_price bigint; v_note text; v_kind text;
begin
  if not public.is_admin() then raise exception 'Somente a administração.'; end if;
  select * into rr from public.refund_requests where id = p_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if rr.status not in ('pendente','aprovado') then raise exception 'O contexto só fica disponível enquanto o pedido está em aberto.'; end if;

  select name, owner_id into h_name, h_owner from public.houses where id = rr.house_id;
  select display_name into c_name from public.profiles where id = rr.client_id;

  if rr.order_id is not null then
    v_kind := 'pedido';
    select * into o from public.service_orders where id = rr.order_id;
    v_title := o.title; v_price := o.price_cents; v_note := o.note; since := o.created_at;
    select description into svc_desc from public.services where id = o.service_id;
    timeline := jsonb_build_array(jsonb_build_object('label','Pedido criado','at',o.created_at));
    if o.started_at is not null then timeline := timeline || jsonb_build_array(jsonb_build_object('label','Casa iniciou o trabalho','at',o.started_at)); end if;
    if o.finished_at is not null then timeline := timeline || jsonb_build_array(jsonb_build_object('label','Casa marcou como concluído','at',o.finished_at)); end if;
  else
    v_kind := 'reserva';
    select * into res from public.reservations where id = rr.reservation_id;
    select * into ev from public.events where id = res.event_id;
    v_title := ev.title; v_price := ev.price_cents; v_note := null; since := res.created_at; svc_desc := ev.description;
    timeline := jsonb_build_array(
      jsonb_build_object('label','Vaga reservada','at',res.created_at),
      jsonb_build_object('label','Início previsto do ritual','at',ev.starts_at));
    if ev.started_at is not null then timeline := timeline || jsonb_build_array(jsonb_build_object('label','Casa iniciou o ritual','at',ev.started_at)); end if;
    if ev.finished_at is not null then timeline := timeline || jsonb_build_array(jsonb_build_object('label','Casa concluiu o ritual','at',ev.finished_at)); end if;
  end if;
  timeline := timeline || jsonb_build_array(jsonb_build_object('label','Cliente pediu o reembolso','at',rr.created_at));

  -- Conversa entre cliente e casa, só a partir da contratação, no máximo 60 mensagens.
  if h_owner is not null and h_owner <> rr.client_id then
    select a.conversation_id into conv
      from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
     where a.user_id = rr.client_id and b.user_id = h_owner
     limit 1;
    if conv is not null then
      select coalesce(jsonb_agg(m order by m.at), '[]'::jsonb) into msgs from (
        select created_at as at,
               case when from_assistant then 'assistente' when sender_id = rr.client_id then 'cliente' else 'casa' end as from,
               text
          from public.messages
         where conversation_id = conv and created_at >= since
         order by created_at desc limit 60
      ) m;
    end if;
  end if;

  insert into public.admin_case_access (admin_id, refund_id) values (auth.uid(), p_id);

  return jsonb_build_object(
    'kind', v_kind, 'title', v_title, 'description', svc_desc, 'price_cents', v_price, 'client_note', v_note,
    'house', h_name, 'client', c_name, 'same_person', (h_owner = rr.client_id),
    'timeline', timeline, 'messages', msgs, 'now', now());
end;
$$;
revoke all on function public.admin_refund_context(uuid) from public, anon;
grant execute on function public.admin_refund_context(uuid) to authenticated;

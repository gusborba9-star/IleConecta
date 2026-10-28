-- 1) "O que a casa faz": texto público da casa sobre os trabalhos que realiza (mesmo sem estarem publicados).
alter table public.houses add column if not exists offerings text;
alter table public.houses drop constraint if exists houses_offerings_len;
alter table public.houses add constraint houses_offerings_len check (offerings is null or char_length(offerings) <= 800);

-- 2) Resposta da casa a um relato de reembolso (a administração lê as duas versões antes de decidir).
alter table public.refund_requests add column if not exists house_response text;
alter table public.refund_requests add column if not exists house_responded_at timestamptz;
alter table public.refund_requests drop constraint if exists refund_house_response_len;
alter table public.refund_requests add constraint refund_house_response_len
  check (house_response is null or char_length(house_response) between 10 and 700);

create or replace function public.respond_refund(p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  rr public.refund_requests%rowtype;
  txt text := btrim(coalesce(p_text, ''));
  v_title text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into rr from public.refund_requests where id = p_id for update;
  if not found or rr.status <> 'pendente' then raise exception 'Este relato não está mais aberto.'; end if;
  if not exists (select 1 from public.houses h where h.id = rr.house_id and h.owner_id = auth.uid()) then
    raise exception 'Somente a casa responde ao relato.' using errcode = '42501';
  end if;
  if char_length(txt) < 10 then raise exception 'Escreva a sua resposta com pelo menos 10 caracteres.'; end if;
  if char_length(txt) > 700 then raise exception 'A resposta é muito longa (máximo 700 caracteres).'; end if;

  update public.refund_requests set house_response = txt, house_responded_at = now(), updated_at = now() where id = p_id;
  perform public.refund_log_add(p_id, auth.uid(), 'resposta_da_casa', txt);

  select coalesce((select o.title from public.service_orders o where o.id = rr.order_id),
                  (select e.title from public.reservations r join public.events e on e.id = r.event_id where r.id = rr.reservation_id), 'o pedido')
    into v_title;
  insert into public.notifications (user_id, text, href)
  select a.user_id, 'A casa respondeu ao relato de reembolso: ' || v_title || '.', '/admin' from public.admins a;
  insert into public.notifications (user_id, text, href)
  values (rr.client_id, 'A casa respondeu ao seu relato sobre ' || v_title || '. A equipe vai analisar as duas versões.', '/atividade');
end $$;
revoke all on function public.respond_refund(uuid, text) from public, anon;
grant execute on function public.respond_refund(uuid, text) to authenticated;

-- 3) O contexto do caso para a administração passa a trazer a resposta da casa.
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
  if rr.house_responded_at is not null then timeline := timeline || jsonb_build_array(jsonb_build_object('label','Casa respondeu ao relato','at',rr.house_responded_at)); end if;

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
    'house_response', rr.house_response, 'house_responded_at', rr.house_responded_at,
    'timeline', timeline, 'messages', msgs, 'now', now());
end;
$$;
revoke all on function public.admin_refund_context(uuid) from public, anon;
grant execute on function public.admin_refund_context(uuid) to authenticated;

-- 4) O aviso à casa dizia que o repasse ficava retido; com cobrança direta no Stripe isso não existe mais.
do $$
declare d text;
begin
  select pg_get_functiondef('public.request_refund(text,uuid,text)'::regprocedure) into d;
  d := replace(d, 'O repasse deste valor fica retido até a decisão.', 'Abra a sua página para responder; a equipe decide com as duas versões.');
  execute d;
end $$;

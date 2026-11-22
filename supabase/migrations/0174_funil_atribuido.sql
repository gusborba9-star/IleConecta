-- 0174 — Funil atribuído do anúncio: visualização → abertura → conversa → pedido/reserva → pagamento (22/11/2026).
-- Só LÊ pedidos/reservas/conversas e ESCREVE em tabelas novas. Nenhum valor, comissão, repasse ou reembolso é tocado.
-- Atribuição por token assinado pelo servidor (HMAC-SHA256): o aparelho nunca informa horário de clique. Último anúncio aberto vence (7 dias).
-- Privacidade: a navegação bruta (promo_events) continua apagada em 24 h. promo_conversions guarda só anúncio + referência (conversa/pedido/reserva)
-- e a data; não guarda quem. Retenção: 13 meses. O pagamento é lido do status ATUAL da reserva/pedido (reembolso sai da conta sozinho).

create table if not exists public.app_secrets (key text primary key, value text not null, created_at timestamptz not null default now());
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from public, anon, authenticated;
insert into public.app_secrets (key, value) values ('promo_hmac', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;

create table if not exists public.promo_conversions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  house_id uuid not null,
  ref_type text not null check (ref_type in ('conversation', 'service_order', 'reservation')),
  ref_id uuid not null,
  token_issued_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (ref_type, ref_id)
);
create index if not exists promo_conversions_promotion_idx on public.promo_conversions (promotion_id);
create index if not exists promo_conversions_created_idx on public.promo_conversions (created_at);
alter table public.promo_conversions enable row level security;
revoke all on public.promo_conversions from public, anon, authenticated;

-- Emite o token ao abrir um anúncio que a pessoa de fato enxerga (e que não é da própria casa).
create or replace function public.promo_open(p_promotion_id uuid, p_city text default null, p_state text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p public.promotions; v_sec text; v_payload text; v_now bigint := extract(epoch from now())::bigint;
begin
  if v_uid is null or p_promotion_id is null then return null; end if;
  select * into p from public.promotions where id = p_promotion_id;
  if not found then return null; end if;
  if exists (select 1 from public.houses h where h.id = p.house_id and h.owner_id = v_uid) then return null; end if;
  if not exists (select 1 from jsonb_array_elements(public.promotions_visible(p_city, p_state)) e where (e ->> 'id')::uuid = p.id) then return null; end if;
  select value into v_sec from public.app_secrets where key = 'promo_hmac';
  if v_sec is null then return null; end if;
  v_payload := encode(convert_to(jsonb_build_object('v', 1, 'p', p.id, 'k', p.kind, 'h', p.house_id, 't', p.item_type, 'i', p.item_id, 'iat', v_now, 'exp', v_now + 7 * 86400, 'n', encode(extensions.gen_random_bytes(8), 'hex'))::text, 'utf8'), 'hex');
  return v_payload || '.' || encode(extensions.hmac(v_payload, v_sec, 'sha256'), 'hex');
exception when others then return null;
end $$;

-- Liga uma conversa/pedido/reserva NOVA da própria pessoa ao anúncio do token. Nunca levanta erro: qualquer dúvida devolve 'ignorado' e a compra segue.
create or replace function public.promo_attribute(p_token text, p_ref_type text, p_ref_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sec text; v_payload text; v_sig text; v_j jsonb; v_now bigint := extract(epoch from now())::bigint; v_iat timestamptz;
  p public.promotions; v_owner uuid; v_created timestamptz; v_ok boolean := false; v_svc uuid; v_ev uuid; v_ins int;
begin
  if v_uid is null or p_token is null or length(p_token) > 2000 or p_ref_id is null or p_ref_type not in ('conversation', 'service_order', 'reservation') then return 'ignorado'; end if;
  v_payload := split_part(p_token, '.', 1); v_sig := split_part(p_token, '.', 2);
  select value into v_sec from public.app_secrets where key = 'promo_hmac';
  if v_sec is null or v_sig is distinct from encode(extensions.hmac(v_payload, v_sec, 'sha256'), 'hex') then return 'ignorado'; end if;
  v_j := convert_from(decode(v_payload, 'hex'), 'utf8')::jsonb;
  if (v_j ->> 'v') is distinct from '1' or (v_j ->> 'exp')::bigint < v_now or (v_j ->> 'iat')::bigint > v_now + 60 then return 'ignorado'; end if;
  select * into p from public.promotions where id = (v_j ->> 'p')::uuid;
  if not found or p.house_id is distinct from (v_j ->> 'h')::uuid then return 'ignorado'; end if;
  select h.owner_id into v_owner from public.houses h where h.id = p.house_id;
  if v_owner is null or v_owner = v_uid then return 'ignorado'; end if;
  v_iat := to_timestamp((v_j ->> 'iat')::bigint);

  if p_ref_type = 'conversation' then
    select c.created_at into v_created from public.conversations c
    where c.id = p_ref_id and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_uid)
      and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_owner);
    v_ok := found;
  elsif p_ref_type = 'service_order' then
    select o.created_at, o.service_id into v_created, v_svc from public.service_orders o where o.id = p_ref_id and o.client_id = v_uid and o.house_id = p.house_id;
    v_ok := found and (p.kind = 'highlight' or (p.item_type = 'service' and p.item_id is not distinct from v_svc));
  else
    select r.created_at, r.event_id into v_created, v_ev from public.reservations r join public.events e on e.id = r.event_id where r.id = p_ref_id and r.user_id = v_uid and e.house_id = p.house_id;
    v_ok := found and (p.kind = 'highlight' or (p.item_type = 'event' and p.item_id is not distinct from v_ev)
      or (p.item_type = 'post' and exists (select 1 from public.posts po where po.id = p.item_id and po.event_id is not distinct from v_ev)));
  end if;
  -- só conta o que nasceu depois da abertura do anúncio (com 1 min de folga para relógio)
  if not v_ok or v_created is null or v_created < v_iat - interval '1 minute' then return 'ignorado'; end if;
  insert into public.promo_conversions (promotion_id, house_id, ref_type, ref_id, token_issued_at) values (p.id, p.house_id, p_ref_type, p_ref_id, v_iat) on conflict (ref_type, ref_id) do nothing;
  get diagnostics v_ins = row_count;
  return case when v_ins > 0 then 'ok' else 'ignorado' end;
exception when others then return 'ignorado';
end $$;

-- Funil da própria casa: conversões atribuídas por anúncio (pagamento lido do status atual, já sem reembolsos).
create or replace function public.promo_funnel() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
    'chats', (select count(*) from public.promo_conversions c where c.promotion_id = p.id and c.ref_type = 'conversation'),
    'checkouts', (select count(*) from public.promo_conversions c where c.promotion_id = p.id and c.ref_type in ('service_order', 'reservation')),
    'payments', (select count(*) from public.promo_conversions c where c.promotion_id = p.id and (
      (c.ref_type = 'reservation' and exists (select 1 from public.reservations r where r.id = c.ref_id and r.status = 'confirmada'))
      or (c.ref_type = 'service_order' and exists (select 1 from public.service_orders o where o.id = c.ref_id and o.status in ('confirmado', 'em_andamento', 'concluido'))))))
  ) from public.promotions p join public.houses h on h.id = p.house_id where h.owner_id = auth.uid()), '[]'::jsonb);
end $$;

revoke all on function public.promo_open(uuid, text, text), public.promo_attribute(text, text, uuid), public.promo_funnel() from public, anon, authenticated;
grant execute on function public.promo_open(uuid, text, text), public.promo_attribute(text, text, uuid), public.promo_funnel() to authenticated, service_role;

-- Retenção: conversões ficam 13 meses.
select cron.schedule('purge-promo-conversions', '48 3 * * *', $c$delete from public.promo_conversions where created_at < now() - interval '13 months'$c$);

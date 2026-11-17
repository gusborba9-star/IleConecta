-- 0148 — Escala (Fase 6): feed rápido e avisos de atualização por pessoa (medido no teste de carga de 17/11/2026: 200 casas, 1.200 clientes, 4.000 membros).
-- (1) O feed lia TODAS as publicações para mostrar as 50 mais novas (varredura + regra de visibilidade em cada linha): ~300 ms com 5 mil posts, crescendo com o número de posts.
--     Com o índice por data, o banco para nas 50 primeiras: ~14 ms.
-- (2) O app ouvia as tabelas de mensagens, pedidos, reservas e reembolsos sem filtro: a cada mudança o servidor de tempo real conferia a permissão de TODOS os conectados.
--     Agora cada pessoa ouve só a própria linha em live_pings (um aviso por assunto), e quem muda a tabela avisa só as pessoas envolvidas.
--     O aviso não carrega conteúdo: só diz "algo mudou em <assunto>"; o app então lê pelas regras de sempre (nada novo é exposto).
-- As tabelas antigas continuam no tempo real até o app novo estar no ar (a retirada delas é a migration 0149).

-- 1) feed
create index if not exists posts_created_idx on public.posts (created_at desc);

-- 2) avisos de atualização
create table if not exists public.live_pings (
  user_id uuid not null,
  topic text not null check (topic in ('messages', 'orders', 'reservations', 'refunds')),
  at timestamptz not null default clock_timestamp(),
  primary key (user_id, topic)
);

alter table public.live_pings enable row level security;

drop policy if exists live_pings_read on public.live_pings;

create policy live_pings_read on public.live_pings for select using (user_id = (select auth.uid()));

revoke all on public.live_pings from public, anon, authenticated;

grant select on public.live_pings to authenticated;

-- grava um aviso para cada pessoa da lista (sem repetir); só os gatilhos abaixo usam
create or replace function public.live_ping(p_users uuid[], p_topic text) returns void
language sql security definer set search_path = public as $$
  insert into public.live_pings (user_id, topic, at)
  select distinct u, p_topic, clock_timestamp() from unnest(coalesce(p_users, '{}'::uuid[])) u where u is not null
  on conflict (user_id, topic) do update set at = excluded.at;
$$;

revoke all on function public.live_ping(uuid[], text) from public, anon, authenticated;

-- mensagens: quem participa da conversa
create or replace function public.live_ping_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
  perform public.live_ping((select array_agg(distinct cm.user_id) from public.conversation_members cm where cm.conversation_id in (select r.conversation_id from new_rows r)), 'messages');
  exception when others then raise warning 'live_ping messages: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.live_ping_messages() from public, anon, authenticated;

drop trigger if exists trg_live_ping_messages_ins on public.messages;

create trigger trg_live_ping_messages_ins after insert on public.messages referencing new table as new_rows for each statement execute function public.live_ping_messages();

drop trigger if exists trg_live_ping_messages_upd on public.messages;

create trigger trg_live_ping_messages_upd after update on public.messages referencing new table as new_rows for each statement execute function public.live_ping_messages();

-- pedidos de serviço: o cliente, a dona da casa e a equipe ativa
create or replace function public.live_ping_orders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
  perform public.live_ping((
    select array_agg(distinct u) from (
      select r.client_id u from new_rows r
      union select h.owner_id from public.houses h where h.id in (select r.house_id from new_rows r)
      union select s.user_id from public.house_staff s where s.active and s.house_id in (select r.house_id from new_rows r)
    ) x), 'orders');
  exception when others then raise warning 'live_ping orders: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.live_ping_orders() from public, anon, authenticated;

drop trigger if exists trg_live_ping_orders_ins on public.service_orders;

create trigger trg_live_ping_orders_ins after insert on public.service_orders referencing new table as new_rows for each statement execute function public.live_ping_orders();

drop trigger if exists trg_live_ping_orders_upd on public.service_orders;

create trigger trg_live_ping_orders_upd after update on public.service_orders referencing new table as new_rows for each statement execute function public.live_ping_orders();

-- reservas de ritual: quem reservou, a dona da casa do ritual e a equipe ativa
create or replace function public.live_ping_reservations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
  perform public.live_ping((
    select array_agg(distinct u) from (
      select r.user_id u from new_rows r
      union select h.owner_id from public.events e join public.houses h on h.id = e.house_id where e.id in (select r.event_id from new_rows r)
      union select s.user_id from public.events e join public.house_staff s on s.house_id = e.house_id and s.active where e.id in (select r.event_id from new_rows r)
    ) x), 'reservations');
  exception when others then raise warning 'live_ping reservations: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.live_ping_reservations() from public, anon, authenticated;

drop trigger if exists trg_live_ping_reservations_ins on public.reservations;

create trigger trg_live_ping_reservations_ins after insert on public.reservations referencing new table as new_rows for each statement execute function public.live_ping_reservations();

drop trigger if exists trg_live_ping_reservations_upd on public.reservations;

create trigger trg_live_ping_reservations_upd after update on public.reservations referencing new table as new_rows for each statement execute function public.live_ping_reservations();

-- reembolsos: o cliente, a dona da casa, a equipe ativa e a administração
create or replace function public.live_ping_refunds() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
  perform public.live_ping((
    select array_agg(distinct u) from (
      select r.client_id u from new_rows r
      union select h.owner_id from public.houses h where h.id in (select r.house_id from new_rows r)
      union select s.user_id from public.house_staff s where s.active and s.house_id in (select r.house_id from new_rows r)
      union select a.user_id from public.admins a
    ) x), 'refunds');
  exception when others then raise warning 'live_ping refunds: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.live_ping_refunds() from public, anon, authenticated;

drop trigger if exists trg_live_ping_refunds_ins on public.refund_requests;

create trigger trg_live_ping_refunds_ins after insert on public.refund_requests referencing new table as new_rows for each statement execute function public.live_ping_refunds();

drop trigger if exists trg_live_ping_refunds_upd on public.refund_requests;

create trigger trg_live_ping_refunds_upd after update on public.refund_requests referencing new table as new_rows for each statement execute function public.live_ping_refunds();

-- entra no tempo real (se a publicação existir) e limpa avisos antigos
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_pings') then
    alter publication supabase_realtime add table public.live_pings;
  end if;
end $$;

do $$
begin
  perform cron.schedule('purge-live-pings', '30 3 * * *', 'delete from public.live_pings where at < now() - interval ''30 days''');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

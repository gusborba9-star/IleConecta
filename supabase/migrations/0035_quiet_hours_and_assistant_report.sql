-- "Não perturbe" (aviso no celular) + relatório da assistente para a casa. Rode no SQL Editor. É seguro repetir.
-- Horário sempre de Brasília. O sino (notificações dentro do app) continua recebendo tudo; só o aviso no celular é silenciado.

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  quiet_on boolean not null default false,
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 7 check (quiet_end between 0 and 23),
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists "prefs: ver as próprias" on public.notification_prefs;
drop policy if exists "prefs: criar as próprias" on public.notification_prefs;
drop policy if exists "prefs: alterar as próprias" on public.notification_prefs;
create policy "prefs: ver as próprias" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "prefs: criar as próprias" on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "prefs: alterar as próprias" on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_prefs from anon;
grant select, insert, update on public.notification_prefs to authenticated;

-- Aviso no celular: respeita o "Não perturbe". Só "precisa de você" (assunto sensível passado pela assistente) fura o silêncio.
create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public, vault, net as $$
declare
  secret text;
  q public.notification_prefs%rowtype;
  h int;
  in_quiet boolean;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then return new; end if;
  select * into q from public.notification_prefs where user_id = new.user_id;
  if found and q.quiet_on and new.text not like '%precisa de você%' then
    h := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
    in_quiet := case when q.quiet_start < q.quiet_end then h >= q.quiet_start and h < q.quiet_end
                     when q.quiet_start > q.quiet_end then h >= q.quiet_start or h < q.quiet_end
                     else false end;
    if in_quiet then return new; end if;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  perform net.http_post(
    url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')),
    body := jsonb_build_object('user_id', new.user_id, 'text', new.text, 'href', new.href));
  return new;
exception when others then
  return new;
end $$;

-- Relatório da casa (só a dona): só números reais do banco.
create or replace function public.house_assistant_report(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hid uuid; hplan text; since timestamptz; day24 timestamptz := now() - interval '24 hours';
  uid uuid := auth.uid();
  res jsonb;
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;
  p_days := least(greatest(coalesce(p_days, 7), 1), 90);
  since := now() - make_interval(days => p_days);
  select h.id, h.plan::text into hid, hplan from public.houses h where h.owner_id = uid;
  if hid is null then raise exception 'Somente a casa vê este relatório.' using errcode = '42501'; end if;

  select jsonb_build_object(
    'days', p_days,
    'plan', hplan,
    'assistant_replies', (select count(*) from public.assistant_usage u where u.house_id = hid and u.created_at >= since),
    'clients_attended', (select count(distinct u.user_id) from public.assistant_usage u where u.house_id = hid and u.created_at >= since),
    'handoffs', (select count(*) from public.notifications n where n.user_id = uid and n.text like '%precisa de você%' and n.created_at >= since),
    -- Clientes que escreveram à noite (22h–7h, Brasília), com a casa ou com a assistente.
    'night_contacts', (select count(distinct m.sender_id) from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
        where m.from_assistant = false and m.sender_id <> uid and m.created_at >= since
          and (extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) >= 22 or extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) < 7)),
    'night_contacts_24h', (select count(distinct m.sender_id) from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
        where m.from_assistant = false and m.sender_id <> uid and m.created_at >= day24
          and (extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) >= 22 or extract(hour from (m.created_at at time zone 'America/Sao_Paulo')) < 7)),
    'contacts_24h', (select count(distinct m.sender_id) from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
        where m.from_assistant = false and m.sender_id <> uid and m.created_at >= day24),
    -- Pedidos e vagas de quem conversou com a assistente nos 7 dias anteriores ("após conversar", não "fechado pela assistente").
    'orders_after_chat', (select count(*) from public.service_orders o
        where o.house_id = hid and o.created_at >= since and o.status::text not in ('cancelado', 'expirado')
          and exists (select 1 from public.assistant_usage u where u.house_id = hid and u.user_id = o.client_id and u.created_at between o.created_at - interval '7 days' and o.created_at)),
    'orders_after_chat_cents', (select coalesce(sum(o.price_cents), 0) from public.service_orders o
        where o.house_id = hid and o.created_at >= since and o.status::text not in ('cancelado', 'expirado')
          and exists (select 1 from public.assistant_usage u where u.house_id = hid and u.user_id = o.client_id and u.created_at between o.created_at - interval '7 days' and o.created_at)),
    'seats_after_chat', (select count(*) from public.reservations r join public.events e on e.id = r.event_id
        where e.house_id = hid and r.created_at >= since and r.status::text not in ('cancelada', 'expirada')
          and exists (select 1 from public.assistant_usage u where u.house_id = hid and u.user_id = r.user_id and u.created_at between r.created_at - interval '7 days' and r.created_at)),
    -- Respostas da assistente por hora do dia (Brasília): mostra em que horário ela mais atendeu.
    'replies_by_hour', (select coalesce(jsonb_agg(coalesce(x.n, 0) order by g.h), '[]'::jsonb)
        from generate_series(0, 23) g(h)
        left join (select extract(hour from (u.created_at at time zone 'America/Sao_Paulo'))::int h, count(*) n
                     from public.assistant_usage u where u.house_id = hid and u.created_at >= since group by 1) x on x.h = g.h)
  ) into res;
  return res;
end $$;
revoke all on function public.house_assistant_report(integer) from public, anon;
grant execute on function public.house_assistant_report(integer) to authenticated;

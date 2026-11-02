-- Divulgação da casa: links por rede social com contagem anônima, e respostas rápidas do chat.
-- Profissional: até 2 links, resumo simples, até 3 respostas rápidas. Premium: até 30 links, contagem por dia, até 50 respostas. Essencial: não inclui.

create table if not exists public.house_campaigns (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9]{2,12}$'),
  label text not null check (char_length(label) between 2 and 40),
  source text not null default 'outro' check (source in ('instagram','whatsapp','facebook','tiktok','youtube','site','outro')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (house_id, code)
);
create table if not exists public.house_campaign_days (
  campaign_id uuid not null references public.house_campaigns(id) on delete cascade,
  day date not null,
  visits int not null default 0,
  contacts int not null default 0,
  primary key (campaign_id, day)
);
create table if not exists public.house_quick_replies (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 40),
  body text not null check (char_length(body) between 2 and 600),
  created_at timestamptz not null default now()
);

alter table public.house_campaigns enable row level security;
alter table public.house_campaign_days enable row level security;
alter table public.house_quick_replies enable row level security;

drop policy if exists "campanhas: a casa gerencia" on public.house_campaigns;
create policy "campanhas: a casa gerencia" on public.house_campaigns for all to authenticated
  using (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()));

drop policy if exists "respostas rápidas: a casa gerencia" on public.house_quick_replies;
create policy "respostas rápidas: a casa gerencia" on public.house_quick_replies for all to authenticated
  using (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.houses h where h.id = house_id and h.owner_id = auth.uid()));
-- house_campaign_days: sem política; só as funções abaixo leem e gravam.

create or replace function public.campaign_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan; n int;
begin
  select plan into p from public.houses where id = new.house_id;
  if p = 'base' then raise exception 'Os links de divulgação fazem parte do plano Profissional.'; end if;
  select count(*) into n from public.house_campaigns where house_id = new.house_id;
  if n >= case when p = 'maximo' then 30 else 2 end then
    raise exception 'Seu plano permite até % links de divulgação.', case when p = 'maximo' then 30 else 2 end;
  end if;
  return new;
end $$;
drop trigger if exists trg_campaign_limit on public.house_campaigns;
create trigger trg_campaign_limit before insert on public.house_campaigns
  for each row execute function public.campaign_plan_limit();

create or replace function public.quick_reply_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan; n int;
begin
  select plan into p from public.houses where id = new.house_id;
  if p = 'base' then raise exception 'As respostas rápidas fazem parte do plano Profissional.'; end if;
  select count(*) into n from public.house_quick_replies where house_id = new.house_id;
  if n >= case when p = 'maximo' then 50 else 3 end then
    raise exception 'Seu plano permite até % respostas rápidas.', case when p = 'maximo' then 50 else 3 end;
  end if;
  return new;
end $$;
drop trigger if exists trg_quick_reply_limit on public.house_quick_replies;
create trigger trg_quick_reply_limit before insert on public.house_quick_replies
  for each row execute function public.quick_reply_plan_limit();

-- Contagem anônima: não guarda quem visitou, só quantas vezes por dia.
create or replace function public.track_campaign(p_slug text, p_code text, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if p_kind not in ('visit','contact') then return; end if;
  select hc.id into c from public.house_campaigns hc join public.houses h on h.id = hc.house_id
    where h.slug = p_slug and hc.code = lower(p_code) and hc.active;
  if c is null then return; end if;
  insert into public.house_campaign_days (campaign_id, day, visits, contacts)
    values (c, (now() at time zone 'America/Sao_Paulo')::date, (p_kind = 'visit')::int, (p_kind = 'contact')::int)
  on conflict (campaign_id, day) do update
    set visits = house_campaign_days.visits + (p_kind = 'visit')::int,
        contacts = house_campaign_days.contacts + (p_kind = 'contact')::int;
end $$;
revoke all on function public.track_campaign(text, text, text) from public;
grant execute on function public.track_campaign(text, text, text) to anon, authenticated;

-- Resumo de cada link (totais e últimos 30 dias). Vale para Profissional e Premium.
create or replace function public.my_campaigns_summary()
returns table (id uuid, code text, label text, source text, active boolean, visits bigint, contacts bigint, visits_30d bigint)
language sql stable security definer set search_path = public as $$
  select hc.id, hc.code, hc.label, hc.source, hc.active,
         coalesce(sum(d.visits),0), coalesce(sum(d.contacts),0),
         coalesce(sum(d.visits) filter (where d.day >= (now() at time zone 'America/Sao_Paulo')::date - 29),0)
  from public.house_campaigns hc
  join public.houses h on h.id = hc.house_id and h.owner_id = auth.uid()
  left join public.house_campaign_days d on d.campaign_id = hc.id
  group by hc.id order by hc.created_at;
$$;
revoke all on function public.my_campaigns_summary() from public;
grant execute on function public.my_campaigns_summary() to authenticated;

-- Contagem dia a dia: só Premium.
create or replace function public.my_campaign_days(p_campaign uuid, p_days int default 30)
returns table (day date, visits int, contacts int)
language plpgsql stable security definer set search_path = public as $$
declare p public.house_plan;
begin
  select h.plan into p from public.house_campaigns hc join public.houses h on h.id = hc.house_id
    where hc.id = p_campaign and h.owner_id = auth.uid();
  if p is null then raise exception 'Link não encontrado.'; end if;
  if p <> 'maximo' then raise exception 'A contagem dia a dia faz parte do plano Premium.'; end if;
  return query select d.day, d.visits, d.contacts from public.house_campaign_days d
    where d.campaign_id = p_campaign and d.day >= (now() at time zone 'America/Sao_Paulo')::date - greatest(p_days,1) + 1
    order by d.day;
end $$;
revoke all on function public.my_campaign_days(uuid, int) from public;
grant execute on function public.my_campaign_days(uuid, int) to authenticated;

-- Membros da casa (filhos de santo e adeptos) e mensalidades mês a mês. É seguro repetir.
-- Regras:
--  * Só a casa dona vê a lista, as anotações e a situação de todos. O membro vê apenas o próprio vínculo e as próprias mensalidades.
--  * Ninguém grava direto nas tabelas: tudo passa pelas funções abaixo, que conferem quem é quem.
--  * Membro entra por convite (link da casa ou link só dele) e vê o que a casa verá antes de aceitar; sai quando quiser.
--  * A casa define valor e dia de vencimento de cada um; paga em mãos = a casa marca o mês como pago.
--  * Sem recorrência: cada mês é uma cobrança avulsa. Aviso ao membro 3 dias antes, no dia e 3 dias depois do vencimento.
--  * Pagamento pelo app (Pix) é ligado em etapa própria; aqui já fica pronto o controle manual e os avisos.

-- ============ tabelas ============
create table if not exists public.house_members (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 2 and 80),
  bond text check (bond is null or char_length(bond) <= 40),
  note text check (note is null or char_length(note) <= 500),
  monthly_cents integer not null default 0 check (monthly_cents = 0 or monthly_cents between 100 and 1000000),
  due_day smallint not null default 10 check (due_day between 1 and 28),
  start_month date not null default date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date,
  consent_at timestamptz,
  consent_version smallint,
  left_at timestamptz,
  left_by text check (left_by in ('casa', 'membro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(day from start_month) = 1)
);
create unique index if not exists house_members_user_active on public.house_members (house_id, user_id) where user_id is not null and left_at is null;
create index if not exists house_members_house_active on public.house_members (house_id) where left_at is null;
create index if not exists house_members_user on public.house_members (user_id) where user_id is not null;
create or replace trigger trg_house_members_updated before update on public.house_members for each row execute function public.set_updated_at();

create table if not exists public.member_dues (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.house_members(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents integer not null check (amount_cents between 100 and 1000000),
  due_date date not null,
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'dispensada')),
  paid_via text check (paid_via in ('app', 'manual')),
  paid_at timestamptz,
  reminded_before boolean not null default false,
  reminded_due boolean not null default false,
  reminded_late boolean not null default false,
  created_at timestamptz not null default now(),
  unique (member_id, month),
  check ((status = 'paga') = (paid_via is not null))
);
create index if not exists member_dues_house_status on public.member_dues (house_id, status, due_date);

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  member_id uuid references public.house_members(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists member_invites_house on public.member_invites (house_id);

create table if not exists public.house_member_settings (
  house_id uuid primary key references public.houses(id) on delete cascade,
  default_cents integer not null default 0 check (default_cents = 0 or default_cents between 100 and 1000000),
  default_due_day smallint not null default 10 check (default_due_day between 1 and 28)
);

-- ============ acesso: só leitura pela casa dona; gravação só pelas funções ============
alter table public.house_members enable row level security;
alter table public.member_dues enable row level security;
alter table public.member_invites enable row level security;
alter table public.house_member_settings enable row level security;

revoke all on public.house_members, public.member_dues, public.member_invites, public.house_member_settings from anon, authenticated;
grant select on public.house_members, public.member_dues, public.house_member_settings to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'house_members' and policyname = 'members: casa ve') then
    create policy "members: casa ve" on public.house_members for select to authenticated using (public.is_house_owner(house_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'member_dues' and policyname = 'dues: casa ve') then
    create policy "dues: casa ve" on public.member_dues for select to authenticated using (public.is_house_owner(house_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'house_member_settings' and policyname = 'member settings: casa ve') then
    create policy "member settings: casa ve" on public.house_member_settings for select to authenticated using (public.is_house_owner(house_id));
  end if;
end $$;
-- member_invites: sem política = ninguém lê direto (o token é segredo; só as funções usam).

-- ============ apoio ============
create or replace function public.member_today() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.member_month(p_day date) returns date
language sql immutable set search_path = public as $$ select date_trunc('month', p_day::timestamp)::date $$;

create or replace function public.member_my_house() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from public.houses where owner_id = auth.uid();
  if h is null then raise exception 'Somente a casa pode fazer isso.'; end if;
  return h;
end $$;

-- Quando a cobrança de um membro novo começa: neste mês se o vencimento ainda não passou, senão no mês seguinte.
create or replace function public.member_default_start(p_due_day integer) returns date
language sql stable set search_path = public as $$
  select case when public.member_month(public.member_today()) + (p_due_day - 1) < public.member_today()
              then (public.member_month(public.member_today()) + interval '1 month')::date
              else public.member_month(public.member_today()) end
$$;

-- Cria a mensalidade do mês, se o membro deve pagar naquele mês.
create or replace function public.member_ensure_due(p_member uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
declare m public.house_members%rowtype;
begin
  select * into m from public.house_members where id = p_member;
  if not found or m.left_at is not null or m.monthly_cents = 0 or m.start_month > p_month then return; end if;
  insert into public.member_dues (member_id, house_id, month, amount_cents, due_date)
  values (m.id, m.house_id, p_month, m.monthly_cents, p_month + (m.due_day - 1))
  on conflict (member_id, month) do nothing;
end $$;

-- Remove as mensalidades em aberto de um membro (usada ao sair ou ser removido).
create or replace function public.member_drop_open_dues(p_member uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.member_dues where member_id = p_member and status = 'aberta'
$$;

create or replace function public.member_money(p_cents integer) returns text
language sql immutable set search_path = public as $$
  select 'R$ ' || replace(to_char(p_cents / 100.0, 'FM9999990.00'), '.', ',')
$$;

-- ============ casa: cadastro ============
create or replace function public.house_member_add(p_name text, p_bond text, p_note text, p_cents integer, p_due_day integer, p_start date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house(); new_id uuid; nm text := trim(coalesce(p_name, ''));
begin
  if char_length(nm) < 2 or char_length(nm) > 80 then raise exception 'Informe o nome (2 a 80 letras).'; end if;
  if coalesce(p_cents, 0) <> 0 and (p_cents < 100 or p_cents > 1000000) then raise exception 'Valor da mensalidade inválido.'; end if;
  if coalesce(p_due_day, 10) not between 1 and 28 then raise exception 'O dia do vencimento vai de 1 a 28.'; end if;
  if (select count(*) from public.house_members where house_id = h and left_at is null) >= 500 then raise exception 'Limite de 500 membros por casa.'; end if;
  insert into public.house_members (house_id, display_name, bond, note, monthly_cents, due_day, start_month)
  values (h, nm, nullif(trim(p_bond), ''), nullif(trim(p_note), ''), coalesce(p_cents, 0), coalesce(p_due_day, 10),
          coalesce(public.member_month(p_start), public.member_default_start(coalesce(p_due_day, 10))))
  returning house_members.id into new_id;
  perform public.member_ensure_due(new_id, public.member_month(public.member_today()));
  return new_id;
end $$;

create or replace function public.house_member_update(p_id uuid, p_name text, p_bond text, p_note text, p_cents integer, p_due_day integer)
returns void language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house(); nm text := trim(coalesce(p_name, '')); cur date := public.member_month(public.member_today());
begin
  if not exists (select 1 from public.house_members where id = p_id and house_id = h and left_at is null) then raise exception 'Membro não encontrado.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 80 then raise exception 'Informe o nome (2 a 80 letras).'; end if;
  if coalesce(p_cents, 0) <> 0 and (p_cents < 100 or p_cents > 1000000) then raise exception 'Valor da mensalidade inválido.'; end if;
  if coalesce(p_due_day, 10) not between 1 and 28 then raise exception 'O dia do vencimento vai de 1 a 28.'; end if;
  update public.house_members
     set display_name = nm, bond = nullif(trim(p_bond), ''), note = nullif(trim(p_note), ''),
         monthly_cents = coalesce(p_cents, 0), due_day = coalesce(p_due_day, 10)
   where id = p_id;
  if coalesce(p_cents, 0) = 0 then
    delete from public.member_dues where member_id = p_id and status = 'aberta' and month >= cur;
  else
    update public.member_dues set amount_cents = p_cents, due_date = month + (coalesce(p_due_day, 10) - 1),
           reminded_before = false, reminded_due = false, reminded_late = false
     where member_id = p_id and status = 'aberta' and month >= cur;
    perform public.member_ensure_due(p_id, cur);
  end if;
end $$;

-- A casa encerra o vínculo: some da lista, mensalidades em aberto saem; o que já foi pago fica no histórico.
create or replace function public.house_member_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house(); m public.house_members%rowtype; hname text;
begin
  select * into m from public.house_members where id = p_id and house_id = h and left_at is null;
  if not found then raise exception 'Membro não encontrado.'; end if;
  update public.house_members set left_at = now(), left_by = 'casa', note = null where id = p_id;
  update public.member_invites set revoked_at = now() where member_id = p_id and revoked_at is null;
  perform public.member_drop_open_dues(p_id);
  if m.user_id is not null then
    select name into hname from public.houses where id = h;
    insert into public.notifications (user_id, text, href) values (m.user_id, hname || ' encerrou o seu vínculo como membro.', '/mensalidades');
  end if;
end $$;

create or replace function public.house_member_set_defaults(p_cents integer, p_due_day integer) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house();
begin
  if coalesce(p_cents, 0) <> 0 and (p_cents < 100 or p_cents > 1000000) then raise exception 'Valor padrão inválido.'; end if;
  if coalesce(p_due_day, 10) not between 1 and 28 then raise exception 'O dia do vencimento vai de 1 a 28.'; end if;
  insert into public.house_member_settings (house_id, default_cents, default_due_day) values (h, coalesce(p_cents, 0), coalesce(p_due_day, 10))
  on conflict (house_id) do update set default_cents = excluded.default_cents, default_due_day = excluded.default_due_day;
end $$;

-- ============ casa: mensalidade do mês ============
create or replace function public.house_member_mark_paid(p_due uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house(); d public.member_dues%rowtype; m public.house_members%rowtype;
begin
  select * into d from public.member_dues where id = p_due and house_id = h for update;
  if not found then raise exception 'Mensalidade não encontrada.'; end if;
  if d.status <> 'aberta' then raise exception 'Esta mensalidade já está resolvida.'; end if;
  update public.member_dues set status = 'paga', paid_via = 'manual', paid_at = now() where id = p_due;
  select * into m from public.house_members where id = d.member_id;
  if m.user_id is not null then
    insert into public.notifications (user_id, text, href)
    values (m.user_id, 'A casa registrou sua mensalidade de ' || to_char(d.month, 'MM/YYYY') || ' como paga.', '/mensalidades');
  end if;
end $$;

create or replace function public.house_member_waive_due(p_due uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house();
begin
  update public.member_dues set status = 'dispensada' where id = p_due and house_id = h and status = 'aberta';
  if not found then raise exception 'Mensalidade não encontrada ou já resolvida.'; end if;
end $$;

-- Desfaz um registro manual ou uma dispensa (pagamento feito pelo app não se desfaz aqui).
create or replace function public.house_member_reopen_due(p_due uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house();
begin
  update public.member_dues set status = 'aberta', paid_via = null, paid_at = null
   where id = p_due and house_id = h and (status = 'dispensada' or (status = 'paga' and paid_via = 'manual'));
  if not found then raise exception 'Só dá para reabrir um registro manual ou uma dispensa.'; end if;
end $$;

-- ============ casa: painel ============
create or replace function public.house_members_overview(p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid := public.member_my_house(); today date := coalesce(p_today, public.member_today()); res jsonb;
begin
  with base as (
    select m.*,
      (select count(*) from public.member_dues d where d.member_id = m.id and d.status = 'aberta' and d.due_date < today) as late_count,
      (select coalesce(sum(d.amount_cents), 0) from public.member_dues d where d.member_id = m.id and d.status = 'aberta' and d.due_date < today) as late_cents,
      (select count(*) from public.member_dues d where d.member_id = m.id and d.status = 'aberta' and d.due_date >= today and d.due_date <= today + 3) as soon_count
    from public.house_members m where m.house_id = h and m.left_at is null
  ), typed as (
    select b.*, case when b.monthly_cents = 0 then 'sem_mensalidade'
                     when b.late_count > 0 then 'vencida'
                     when b.soon_count > 0 then 'perto'
                     else 'em_dia' end as situacao
    from base b
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', (select count(*) from typed),
      'vencidas', (select count(*) from typed where situacao = 'vencida'),
      'perto', (select count(*) from typed where situacao = 'perto'),
      'em_dia', (select count(*) from typed where situacao = 'em_dia'),
      'atrasado_cents', (select coalesce(sum(late_cents), 0) from typed)),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.display_name, 'bond', t.bond, 'note', t.note,
        'monthly_cents', t.monthly_cents, 'due_day', t.due_day, 'start_month', t.start_month,
        'has_account', t.user_id is not null, 'consent_at', t.consent_at,
        'situacao', t.situacao, 'late_count', t.late_count, 'late_cents', t.late_cents,
        'dues', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'month', d.month, 'amount_cents', d.amount_cents,
                   'due_date', d.due_date, 'status', d.status, 'paid_via', d.paid_via) order by d.month desc)
                  from (select * from public.member_dues x where x.member_id = t.id order by x.month desc limit 6) d), '[]'::jsonb)
      ) order by case t.situacao when 'vencida' then 0 when 'perto' then 1 when 'em_dia' then 2 else 3 end, lower(t.display_name))
      from typed t), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ============ convites ============
create or replace function public.house_member_create_invite(p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house(); tok text;
begin
  if p_member is null then
    select token into tok from public.member_invites
     where house_id = h and member_id is null and revoked_at is null limit 1;
    if tok is not null then return tok; end if;
  else
    if not exists (select 1 from public.house_members where id = p_member and house_id = h and left_at is null and user_id is null) then
      raise exception 'Este membro já tem conta ou não foi encontrado.';
    end if;
    update public.member_invites set revoked_at = now() where member_id = p_member and revoked_at is null;
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.member_invites (house_id, member_id, token, expires_at)
  values (h, p_member, tok, case when p_member is null then null else now() + interval '30 days' end);
  return tok;
end $$;

create or replace function public.house_member_revoke_invite() returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := public.member_my_house();
begin
  update public.member_invites set revoked_at = now() where house_id = h and member_id is null and revoked_at is null;
end $$;

-- O que a pessoa vê antes de aceitar. Devolve null se o link não vale.
create or replace function public.member_invite_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i public.member_invites%rowtype; hname text; hslug text; hown uuid; mname text;
begin
  if auth.uid() is null then return null; end if;
  select * into i from public.member_invites where token = p_token and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select name, slug, owner_id into hname, hslug, hown from public.houses where id = i.house_id;
  if i.member_id is not null then select display_name into mname from public.house_members where id = i.member_id and left_at is null and user_id is null; if mname is null then return null; end if; end if;
  return jsonb_build_object('house_name', hname, 'house_slug', hslug, 'member_name', mname, 'is_owner', hown = auth.uid(),
    'already_member', exists (select 1 from public.house_members where house_id = i.house_id and user_id = auth.uid() and left_at is null));
end $$;

create or replace function public.member_invite_accept(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i public.member_invites%rowtype; hrow public.houses%rowtype; st public.house_member_settings%rowtype;
        mid uuid; pname text; cur date := public.member_month(public.member_today());
begin
  if uid is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
  select * into i from public.member_invites where token = p_token and revoked_at is null and (expires_at is null or expires_at > now()) for update;
  if not found then raise exception 'Este convite não está mais válido.'; end if;
  select * into hrow from public.houses where id = i.house_id;
  if hrow.owner_id = uid then raise exception 'Você é a dona desta casa.'; end if;
  select id into mid from public.house_members where house_id = i.house_id and user_id = uid and left_at is null;
  if mid is not null then return jsonb_build_object('house_id', i.house_id, 'member_id', mid, 'already', true); end if;
  select display_name into pname from public.profiles where id = uid;

  if i.member_id is not null then
    update public.house_members set user_id = uid, consent_at = now(), consent_version = 1
     where id = i.member_id and left_at is null and user_id is null returning id into mid;
    if mid is null then raise exception 'Este convite não está mais válido.'; end if;
  else
    if (select count(*) from public.house_members where house_id = i.house_id and left_at is null) >= 500 then raise exception 'Esta casa atingiu o limite de membros.'; end if;
    select * into st from public.house_member_settings where house_id = i.house_id;
    insert into public.house_members (house_id, user_id, display_name, monthly_cents, due_day, start_month, consent_at, consent_version)
    values (i.house_id, uid, coalesce(pname, 'Membro'), coalesce(st.default_cents, 0), coalesce(st.default_due_day, 10),
            public.member_default_start(coalesce(st.default_due_day, 10)), now(), 1)
    returning id into mid;
  end if;
  update public.member_invites set uses = uses + 1 where id = i.id;
  perform public.member_ensure_due(mid, cur);
  insert into public.notifications (user_id, text, href)
  values (hrow.owner_id, coalesce(pname, 'Uma pessoa') || ' entrou na sua lista de membros.', '/painel/membros');
  return jsonb_build_object('house_id', i.house_id, 'member_id', mid, 'already', false);
end $$;

-- ============ membro ============
create or replace function public.my_memberships() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'member_id', m.id, 'house_id', h.id, 'house_name', h.name, 'house_slug', h.slug, 'owner_id', h.owner_id,
    'monthly_cents', m.monthly_cents, 'due_day', m.due_day, 'since', m.created_at,
    'can_pay_app', public.payments_enabled(h.owner_id),
    'dues', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'month', d.month, 'amount_cents', d.amount_cents,
                'due_date', d.due_date, 'status', d.status, 'paid_via', d.paid_via) order by d.month desc)
               from (select * from public.member_dues x where x.member_id = m.id order by x.month desc limit 12) d), '[]'::jsonb)
  ) order by h.name), '[]'::jsonb)
  from public.house_members m join public.houses h on h.id = m.house_id
  where m.user_id = auth.uid() and m.left_at is null
$$;

-- O membro sai quando quiser. O histórico financeiro fica; a anotação da casa sobre ele é apagada.
create or replace function public.member_leave(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.house_members%rowtype; h public.houses%rowtype;
begin
  select * into m from public.house_members where id = p_member and user_id = auth.uid() and left_at is null;
  if not found then raise exception 'Vínculo não encontrado.'; end if;
  update public.house_members set left_at = now(), left_by = 'membro', note = null where id = p_member;
  perform public.member_drop_open_dues(p_member);
  select * into h from public.houses where id = m.house_id;
  insert into public.notifications (user_id, text, href) values (h.owner_id, m.display_name || ' saiu da sua lista de membros.', '/painel/membros');
end $$;

-- ============ rotina diária: cria as mensalidades do mês e avisa os membros ============
create or replace function public.member_dues_daily(p_today date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare today date := coalesce(p_today, public.member_today()); cur date := public.member_month(coalesce(p_today, public.member_today()));
        r record; sent integer := 0; before_n bigint; after_n bigint;
begin
  select count(*) into before_n from public.member_dues;
  for r in select id from public.house_members where left_at is null and monthly_cents > 0 and start_month <= cur loop
    perform public.member_ensure_due(r.id, cur);
  end loop;
  select count(*) into after_n from public.member_dues;

  for r in
    select d.id as due_id, d.amount_cents, d.due_date, m.user_id, h.name as house_name,
           (d.due_date - today) as days_left,
           d.reminded_before, d.reminded_due, d.reminded_late
      from public.member_dues d
      join public.house_members m on m.id = d.member_id and m.left_at is null and m.user_id is not null
      join public.houses h on h.id = d.house_id
     where d.status = 'aberta'
  loop
    if r.days_left = 0 and not r.reminded_due then
      insert into public.notifications (user_id, text, href)
      values (r.user_id, 'Sua mensalidade da casa ' || r.house_name || ' vence hoje (' || public.member_money(r.amount_cents) || ').', '/mensalidades');
      update public.member_dues set reminded_due = true, reminded_before = true where id = r.due_id;
      sent := sent + 1;
    elsif r.days_left between 1 and 3 and not r.reminded_before then
      insert into public.notifications (user_id, text, href)
      values (r.user_id, 'Sua mensalidade da casa ' || r.house_name || ' vence em ' || r.days_left || (case when r.days_left = 1 then ' dia' else ' dias' end) || ' (' || public.member_money(r.amount_cents) || ').', '/mensalidades');
      update public.member_dues set reminded_before = true where id = r.due_id;
      sent := sent + 1;
    elsif r.days_left <= -3 and not r.reminded_late then
      insert into public.notifications (user_id, text, href)
      values (r.user_id, 'A mensalidade da casa ' || r.house_name || ' está em atraso (' || public.member_money(r.amount_cents) || ').', '/mensalidades');
      update public.member_dues set reminded_late = true, reminded_due = true, reminded_before = true where id = r.due_id;
      sent := sent + 1;
    end if;
  end loop;
  return jsonb_build_object('today', today, 'mensalidades_criadas', after_n - before_n, 'avisos', sent);
end $$;

-- ============ permissões das funções ============
revoke all on function public.member_ensure_due(uuid, date) from public, anon, authenticated;
revoke all on function public.member_drop_open_dues(uuid) from public, anon, authenticated;
revoke all on function public.member_dues_daily(date) from public, anon, authenticated;
revoke all on function public.member_my_house() from public, anon;
grant execute on function public.member_my_house() to authenticated;
revoke all on function public.member_today() from public, anon;
grant execute on function public.member_today() to authenticated;
revoke all on function public.member_month(date) from public, anon;
grant execute on function public.member_month(date) to authenticated;
revoke all on function public.member_default_start(integer) from public, anon;
grant execute on function public.member_default_start(integer) to authenticated;
revoke all on function public.member_money(integer) from public, anon;
grant execute on function public.member_money(integer) to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'house_member_add(text, text, text, integer, integer, date)',
    'house_member_update(uuid, text, text, text, integer, integer)',
    'house_member_remove(uuid)',
    'house_member_set_defaults(integer, integer)',
    'house_member_mark_paid(uuid)',
    'house_member_waive_due(uuid)',
    'house_member_reopen_due(uuid)',
    'house_members_overview(date)',
    'house_member_create_invite(uuid)',
    'house_member_revoke_invite()',
    'member_invite_preview(text)',
    'member_invite_accept(text)',
    'my_memberships()',
    'member_leave(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Todo dia às 11:00 UTC (08:00 em Brasília): cria as mensalidades do mês e manda os avisos.
do $$
begin
  perform cron.unschedule('member-dues-daily');
exception when others then null;
end $$;
select cron.schedule('member-dues-daily', '0 11 * * *', $job$ select public.member_dues_daily() $job$);

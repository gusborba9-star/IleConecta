-- 0192 — Avisos de segurança da conta (23/11/2026): aparelho novo, bloqueio progressivo por tentativas, senha e palavra alteradas,
-- "Não fui eu" (fila do dono) e desbloqueio por link no e-mail da conta.
-- Princípios: o estado do bloqueio é por E-MAIL (existindo conta ou não), para a resposta do login ser igual; só o servidor
-- (service_role) mexe nas tabelas; nada de senha, token ou IP bruto é guardado; o aparelho é só um hash.

-- ============ 1) Tabelas
create table if not exists public.security_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Aparelho',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_hash)
);

create table if not exists public.security_login_state (
  email_key text primary key,
  fails smallint not null default 0,
  round smallint not null default 0,
  last_fail_at timestamptz,
  last_lock_at timestamptz,
  locked_until timestamptz,
  needs_email boolean not null default false
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('login_novo_aparelho', 'conta_bloqueada', 'senha_alterada', 'palavra_alterada')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  mail_claim_at timestamptz,
  mailed_at timestamptz,
  token_hash text,
  token_expires timestamptz,
  unlocked_at timestamptz
);
create index if not exists security_events_user on public.security_events (user_id, created_at desc);
create index if not exists security_events_due on public.security_events (created_at) where mailed_at is null;

create table if not exists public.security_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.security_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'aberto' check (status in ('aberto', 'resolvido')),
  source text not null default 'email' check (source in ('email', 'app')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);

alter table public.security_devices enable row level security;
alter table public.security_login_state enable row level security;
alter table public.security_events enable row level security;
alter table public.security_reports enable row level security;
revoke all on table public.security_devices, public.security_login_state, public.security_events, public.security_reports from public, anon, authenticated;

-- ============ 2) Aviso no sino (texto curto; o detalhe fica na tela de segurança)
create or replace function public.sec_notice_text(p_kind text, p_detail jsonb) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'login_novo_aparelho' then 'Entrada em um aparelho novo (' || coalesce(p_detail->>'label', 'aparelho') || '). Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'conta_bloqueada' then 'Sua conta foi bloqueada por excesso de tentativas de senha. Se foi você, aguarde ou desbloqueie. Se não foi, toque aqui.'
    when 'senha_alterada' then 'Sua senha foi alterada. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'palavra_alterada' then 'Sua palavra de segurança foi alterada. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    else 'Aviso de segurança da sua conta.' end
$$;

create or replace function public.sec_event_add(p_user uuid, p_kind text, p_detail jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.security_events (user_id, kind, detail) values (p_user, p_kind, coalesce(p_detail, '{}'::jsonb)) returning id into v_id;
  -- Sino: só se a conta tem perfil. Falha de aviso nunca desfaz o login nem a troca de senha.
  begin
    insert into public.notifications (user_id, text, href)
    select p_user, public.sec_notice_text(p_kind, p_detail), '/seguranca' where exists (select 1 from public.profiles where id = p_user);
  exception when others then null; end;
  return v_id;
end $$;

-- ============ 3) Bloqueio progressivo (por e-mail normalizado, exista conta ou não)
-- 5 erros: 15 min; mais 5: 1 h; a partir da 3ª rodada em 24 h: só o link no e-mail da conta abre.
create or replace function public.sec_login_check(p_key text, p_device_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.security_login_state%rowtype; v_uid uuid;
begin
  if p_key is null or p_key = '' then return jsonb_build_object('locked', false); end if;
  select * into s from public.security_login_state where email_key = left(p_key, 254);
  if not found or s.locked_until is null or s.locked_until <= now() then return jsonb_build_object('locked', false); end if;
  -- Aparelho já conhecido do dono continua entrando (quem chuta senha não tem o aparelho).
  if p_device_hash is not null then
    select u.id into v_uid from auth.users u where public.email_key(u.email) = left(p_key, 254) limit 1;
    if v_uid is not null and exists (select 1 from public.security_devices d where d.user_id = v_uid and d.device_hash = p_device_hash) then
      return jsonb_build_object('locked', false, 'known_device', true);
    end if;
  end if;
  return jsonb_build_object('locked', true, 'until', s.locked_until, 'needs_email', s.needs_email);
end $$;

create or replace function public.sec_login_fail(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.security_login_state%rowtype; v_uid uuid; v_mins int; v_ev uuid;
begin
  if p_key is null or p_key = '' then return jsonb_build_object('locked', false); end if;
  insert into public.security_login_state (email_key) values (left(p_key, 254)) on conflict (email_key) do nothing;
  select * into s from public.security_login_state where email_key = left(p_key, 254) for update;
  if s.last_lock_at is not null and s.last_lock_at < now() - interval '24 hours' then s.round := 0; end if;
  if s.last_fail_at is not null and s.last_fail_at < now() - interval '1 hour' and s.locked_until is null then s.fails := 0; end if;
  s.fails := s.fails + 1; s.last_fail_at := now();
  if s.fails >= 5 and (s.locked_until is null or s.locked_until <= now()) then
    s.round := s.round + 1; s.fails := 0; s.last_lock_at := now();
    v_mins := case when s.round = 1 then 15 when s.round = 2 then 60 else 1440 end;
    s.locked_until := now() + make_interval(mins => v_mins);
    s.needs_email := s.round >= 3;
    select u.id into v_uid from auth.users u where public.email_key(u.email) = left(p_key, 254) limit 1;
    if v_uid is not null then v_ev := public.sec_event_add(v_uid, 'conta_bloqueada', jsonb_build_object('round', s.round, 'minutes', v_mins, 'needs_email', s.needs_email)); end if;
  end if;
  update public.security_login_state set fails = s.fails, round = s.round, last_fail_at = s.last_fail_at, last_lock_at = s.last_lock_at,
    locked_until = s.locked_until, needs_email = s.needs_email where email_key = left(p_key, 254);
  return jsonb_build_object('locked', s.locked_until is not null and s.locked_until > now(), 'until', s.locked_until, 'needs_email', s.needs_email);
end $$;

-- Login certo: zera o contador e registra o aparelho. Aviso só quando já havia outro aparelho (o primeiro é o cadastro).
create or replace function public.sec_login_ok(p_user uuid, p_device_hash text, p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_had boolean; v_known boolean; v_label text := left(regexp_replace(coalesce(nullif(btrim(p_label), ''), 'Aparelho'), '[^[:alnum:] ·.,()/+-]', '', 'g'), 60);
begin
  select public.email_key(u.email) into v_key from auth.users u where u.id = p_user;
  if v_key is not null then
    update public.security_login_state set fails = 0, last_fail_at = null where email_key = v_key and (locked_until is null or locked_until <= now());
  end if;
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select exists (select 1 from public.security_devices where user_id = p_user) into v_had;
  select exists (select 1 from public.security_devices where user_id = p_user and device_hash = p_device_hash) into v_known;
  if v_known then update public.security_devices set last_seen = now() where user_id = p_user and device_hash = p_device_hash; return null; end if;
  insert into public.security_devices (user_id, device_hash, label) values (p_user, p_device_hash, v_label) on conflict do nothing;
  if not v_had then return null; end if;
  return public.sec_event_add(p_user, 'login_novo_aparelho', jsonb_build_object('label', v_label));
end $$;

-- ============ 4) Fila de e-mails de segurança
create or replace function public.sec_due_events() returns table (id uuid, kind text, detail jsonb, created_at timestamptz, user_id uuid, email text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    with c as (
      update public.security_events e set mail_claim_at = now()
      where e.id in (select x.id from public.security_events x where x.mailed_at is null and x.created_at > now() - interval '2 days'
                       and (x.mail_claim_at is null or x.mail_claim_at < now() - interval '10 minutes') order by x.created_at limit 20 for update skip locked)
      returning e.id, e.kind, e.detail, e.created_at, e.user_id)
    select c.id, c.kind, c.detail, c.created_at, c.user_id, u.email::text from c join auth.users u on u.id = c.user_id;
end $$;

create or replace function public.sec_event_set_token(p_id uuid, p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.security_events set token_hash = p_hash, token_expires = now() + interval '7 days' where id = p_id and mailed_at is null;
  return found;
end $$;

create or replace function public.sec_event_mark_mailed(p_id uuid) returns void
language sql security definer set search_path = '' as $$ update public.security_events set mailed_at = now() where id = p_id and mailed_at is null $$;

-- ============ 5) Links do e-mail: "Fui eu, desbloquear" e "Não fui eu"
create or replace function public.sec_unlock(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e public.security_events%rowtype; v_key text;
begin
  select * into e from public.security_events where token_hash = p_hash and kind = 'conta_bloqueada' and token_expires > now() and unlocked_at is null for update;
  if not found then return false; end if;
  select public.email_key(u.email) into v_key from auth.users u where u.id = e.user_id;
  update public.security_login_state set fails = 0, locked_until = null, needs_email = false where email_key = v_key;
  update public.security_events set unlocked_at = now() where id = e.id;
  return true;
end $$;

create or replace function public.sec_report(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e public.security_events%rowtype;
begin
  select * into e from public.security_events where token_hash = p_hash and token_expires > now();
  if not found then return false; end if;
  insert into public.security_reports (event_id, user_id, source) values (e.id, e.user_id, 'email') on conflict (event_id) do nothing;
  return true;
end $$;

-- Dentro do app (logado): a pessoa vê os próprios avisos e marca "Não fui eu".
create or replace function public.my_security_events() returns table (id uuid, kind text, detail jsonb, created_at timestamptz, reported boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.kind, e.detail, e.created_at, exists (select 1 from public.security_reports r where r.event_id = e.id)
  from public.security_events e where e.user_id = auth.uid() order by e.created_at desc limit 30
$$;

create or replace function public.my_security_report(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if not exists (select 1 from public.security_events where id = p_event and user_id = auth.uid()) then return false; end if;
  insert into public.security_reports (event_id, user_id, source) values (p_event, auth.uid(), 'app') on conflict (event_id) do nothing;
  return true;
end $$;

-- ============ 6) Gatilhos: senha e palavra de segurança alteradas
create or replace function public.sec_on_password_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin perform public.sec_event_add(new.id, 'senha_alterada', '{}'::jsonb); exception when others then null; end;
  return new;
end $$;
revoke all on function public.sec_on_password_change() from public, anon, authenticated;
drop trigger if exists on_auth_user_password_changed on auth.users;
create trigger on_auth_user_password_changed after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password and old.encrypted_password is not null) execute function public.sec_on_password_change();

create or replace function public.sec_on_word_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin perform public.sec_event_add(coalesce(new.user_id, old.user_id), 'palavra_alterada', jsonb_build_object('action', lower(tg_op))); exception when others then null; end;
  return coalesce(new, old);
end $$;
revoke all on function public.sec_on_word_change() from public, anon, authenticated;
drop trigger if exists on_security_word_changed on public.account_security_words;
create trigger on_security_word_changed after insert or update or delete on public.account_security_words
  for each row execute function public.sec_on_word_change();

-- ============ 7) Fila do dono: pedidos "Não fui eu"
create or replace function public.admin_security_reports(p_status text default 'aberto')
returns table (id uuid, created_at timestamptz, status text, source text, kind text, detail jsonb, event_at timestamptz, user_id uuid, display_name text, note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query select r.id, r.created_at, r.status, r.source, e.kind, e.detail, e.created_at, r.user_id, p.display_name, r.note
    from public.security_reports r join public.security_events e on e.id = r.event_id left join public.profiles p on p.id = r.user_id
    where p_status is null or p_status = 'todos' or r.status = p_status order by r.created_at desc limit 200;
end $$;

create or replace function public.admin_security_resolve(p_id uuid, p_note text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.security_reports set status = 'resolvido', resolved_at = now(), resolved_by = auth.uid(), note = left(btrim(coalesce(p_note, '')), 500) where id = p_id and status = 'aberto';
  return found;
end $$;

-- ============ 8) Permissões
revoke all on function public.sec_notice_text(text, jsonb), public.sec_event_add(uuid, text, jsonb), public.sec_login_check(text, text), public.sec_login_fail(text),
  public.sec_login_ok(uuid, text, text), public.sec_due_events(), public.sec_event_set_token(uuid, text), public.sec_event_mark_mailed(uuid),
  public.sec_unlock(text), public.sec_report(text) from public, anon, authenticated;
grant execute on function public.sec_login_check(text, text), public.sec_login_fail(text), public.sec_login_ok(uuid, text, text), public.sec_due_events(),
  public.sec_event_set_token(uuid, text), public.sec_event_mark_mailed(uuid), public.sec_unlock(text), public.sec_report(text) to service_role;
revoke all on function public.my_security_events(), public.my_security_report(uuid), public.admin_security_reports(text), public.admin_security_resolve(uuid, text) from public, anon;
grant execute on function public.my_security_events(), public.my_security_report(uuid), public.admin_security_reports(text), public.admin_security_resolve(uuid, text) to authenticated;

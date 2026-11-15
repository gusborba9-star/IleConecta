-- 0121 — Moderação, fase 2: promessas garantidas vão para uma fila da administração (nada é recusado na hora).
-- Fluxo (decisão do proprietário + advogado, 15/11/2026): a administração orienta (educativo, durante o período de adaptação de 30 dias),
-- depois advertência oficial com prazo de 72 horas (15 dias para contato externo em conteúdo antigo); sem correção no prazo, só aquele
-- anúncio é ocultado até a correção; a casa pode contestar em 7 dias corridos. Nunca olha o chat.

-- ============ 1) Detector de promessa garantida (puro; só sinaliza, nunca recusa)
create or replace function public.promise_in_text(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
declare t text := lower(coalesce(p_text, ''));
begin
  if t = '' then return false; end if;
  if t ~ '(garant\w*[^.!?]{0,40}(resultado|retorno|sucesso|amor|cura|vit[oó]ria|efic|funcion))|((resultado|retorno|sucesso|amor|cura|vit[oó]ria|efic\w*|funcion\w*)[^.!?]{0,40}garant\w*)' then return true; end if;
  if t ~ '100 ?(%|por ?cento)[^.!?]{0,30}(garant|cert|efic|sucesso|resultado|funcion)' then return true; end if;
  if t ~ '((em|at[eé]|dentro de)[ ]+[0-9]+[ ]+(dias?|horas?|semanas?)[^.!?]{0,40}(resultado|retorno|volta|traz|trago|resolv|cura|amor|sucesso))|((trago|traz|volta|resolv\w*|cura\w*|amarr\w*|garant\w*)[^.!?]{0,40}(em|at[eé]|dentro de)[ ]+[0-9]+[ ]+(dias?|horas?|semanas?))' then return true; end if;
  if t ~ '(amarra\w*[^.!?]{0,20}garant|garant\w*[^.!?]{0,20}amarra)' then return true; end if;
  if t ~ '(nunca falha|sem falhas?|n[aã]o falha|resultado certo|resultado imediato|efic[aá]cia comprovada)' then return true; end if;
  return false;
end $$;
revoke all on function public.promise_in_text(text) from public, anon, authenticated;

-- ============ 2) Ocultação por moderação (só a administração mexe)
alter table public.services add column if not exists moderation_hidden boolean not null default false;
alter table public.events add column if not exists moderation_hidden boolean not null default false;
alter table public.posts add column if not exists moderation_hidden boolean not null default false;

drop policy if exists services_read on public.services;
create policy services_read on public.services for select using ((active and listed and not moderation_hidden) or is_house_owner(house_id));
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using ((status = any (array['publicado'::event_status, 'encerrado'::event_status]) and not moderation_hidden) or is_house_owner(house_id));
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (not moderation_hidden or is_house_owner(house_id));

create or replace function public.moderation_hidden_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.moderation', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then new.moderation_hidden := false;
  else new.moderation_hidden := old.moderation_hidden; end if;
  return new;
end $$;
revoke all on function public.moderation_hidden_guard() from public, anon, authenticated;
drop trigger if exists trg_moderation_hidden on public.services;
create trigger trg_moderation_hidden before insert or update on public.services for each row execute function public.moderation_hidden_guard();
drop trigger if exists trg_moderation_hidden on public.events;
create trigger trg_moderation_hidden before insert or update on public.events for each row execute function public.moderation_hidden_guard();
drop trigger if exists trg_moderation_hidden on public.posts;
create trigger trg_moderation_hidden before insert or update on public.posts for each row execute function public.moderation_hidden_guard();

-- ============ 3) Fila e período de adaptação
create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  target_table text not null check (target_table in ('services', 'events', 'posts')),
  target_id uuid not null,
  reason text not null default 'promessa' check (reason in ('promessa', 'contato_antigo')),
  excerpt text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'orientada', 'advertida', 'ocultada', 'contestada', 'encerrada')),
  outcome text check (outcome in ('corrigido', 'dispensado', 'contestacao_aceita')),
  created_at timestamptz not null default now(),
  orientation_at timestamptz,
  warned_at timestamptz,
  deadline_at timestamptz,
  hidden_at timestamptz,
  contested_at timestamptz,
  contest_text text,
  contest_decision text check (contest_decision in ('mantida')),
  admin_note text,
  handled_by uuid references auth.users(id),
  closed_at timestamptz
);
create unique index if not exists moderation_flags_one_open on public.moderation_flags (target_table, target_id) where status <> 'encerrada';
create index if not exists moderation_flags_house on public.moderation_flags (house_id, created_at desc);
create index if not exists moderation_flags_status on public.moderation_flags (status, created_at desc);
alter table public.moderation_flags enable row level security;
-- sem políticas: ninguém lê nem escreve direto; tudo passa pelas funções abaixo

create table if not exists public.moderation_settings (
  id boolean primary key default true check (id),
  adaptation_start timestamptz,
  adaptation_days integer not null default 30 check (adaptation_days between 1 and 365)
);
insert into public.moderation_settings (id) values (true) on conflict do nothing;
alter table public.moderation_settings enable row level security;

-- ============ 4) Aviso à casa (notificação curta; o texto completo fica na tela /moderacao)
create or replace function public.moderation_notify(p_house uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, text, href) select h.owner_id, p_text, '/moderacao' from public.houses h where h.id = p_house;
end $$;
revoke all on function public.moderation_notify(uuid, text) from public, anon, authenticated;

-- ============ 5) Gatilho: sinaliza (sem recusar) e fecha o chamado sozinho quando o texto é corrigido
create or replace function public.moderation_promise_watch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new); cols text[] := tg_argv; col text; txt text := ''; bad boolean; hid uuid; f record;
begin
  foreach col in array cols loop txt := txt || ' ' || coalesce(j ->> col, ''); end loop;
  hid := (j ->> 'house_id')::uuid;
  bad := public.promise_in_text(txt);
  select * into f from public.moderation_flags where target_table = tg_table_name and target_id = new.id and status <> 'encerrada';
  if bad then
    if f.id is null then
      insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
      values (hid, tg_table_name, new.id, 'promessa', left(btrim(txt), 300));
    end if;
  elsif f.id is not null and f.reason = 'promessa' then
    perform set_config('app.moderation', '1', true);
    execute format('update public.%I set moderation_hidden = false where id = $1', tg_table_name) using new.id;
    update public.moderation_flags set status = 'encerrada', outcome = 'corrigido', closed_at = now() where id = f.id;
    if f.status in ('advertida', 'ocultada', 'contestada') then
      perform public.moderation_notify(hid, 'Obrigado por ajustar o anúncio. Ele está regularizado no Ilê Conecta.');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.moderation_promise_watch() from public, anon, authenticated;

drop trigger if exists trg_moderation_promise on public.services;
create trigger trg_moderation_promise after insert or update of title, description on public.services for each row execute function public.moderation_promise_watch('title', 'description');
drop trigger if exists trg_moderation_promise on public.events;
create trigger trg_moderation_promise after insert or update of title, description on public.events for each row execute function public.moderation_promise_watch('title', 'description');
drop trigger if exists trg_moderation_promise on public.posts;
create trigger trg_moderation_promise after insert or update of content on public.posts for each row execute function public.moderation_promise_watch('content');

-- ============ 6) Varredura do que já existe (promessas, e contato externo de casas Grátis em conteúdo antigo)
create or replace function public.moderation_scan()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r integer;
begin
  insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
  select s.house_id, 'services', s.id, 'promessa', left(btrim(s.title || ' ' || coalesce(s.description, '')), 300) from public.services s
  where public.promise_in_text(s.title || ' ' || coalesce(s.description, '')) on conflict do nothing;
  get diagnostics r = row_count; n := n + r;
  insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
  select e.house_id, 'events', e.id, 'promessa', left(btrim(e.title || ' ' || coalesce(e.description, '')), 300) from public.events e
  where public.promise_in_text(e.title || ' ' || coalesce(e.description, '')) on conflict do nothing;
  get diagnostics r = row_count; n := n + r;
  insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
  select p.house_id, 'posts', p.id, 'promessa', left(btrim(p.content), 300) from public.posts p
  where public.promise_in_text(p.content) on conflict do nothing;
  get diagnostics r = row_count; n := n + r;
  insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
  select s.house_id, 'services', s.id, 'contato_antigo', left(btrim(s.title || ' ' || coalesce(s.description, '')), 300) from public.services s join public.houses h on h.id = s.house_id
  where h.plan::text = 'gratis' and public.contact_in_text(s.title || ' ' || coalesce(s.description, '')) on conflict do nothing;
  get diagnostics r = row_count; n := n + r;
  insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
  select e.house_id, 'events', e.id, 'contato_antigo', left(btrim(e.title || ' ' || coalesce(e.description, '')), 300) from public.events e join public.houses h on h.id = e.house_id
  where h.plan::text = 'gratis' and public.contact_in_text(e.title || ' ' || coalesce(e.description, '')) on conflict do nothing;
  get diagnostics r = row_count; n := n + r;
  insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
  select p.house_id, 'posts', p.id, 'contato_antigo', left(btrim(p.content), 300) from public.posts p join public.houses h on h.id = p.house_id
  where h.plan::text = 'gratis' and public.contact_in_text(p.content) on conflict do nothing;
  get diagnostics r = row_count; n := n + r;
  return n;
end $$;
revoke all on function public.moderation_scan() from public, anon, authenticated;

-- ============ 7) Prazo vencido: oculta só o anúncio (a contestação em curso suspende o prazo)
create or replace function public.moderation_enforce()
returns integer language plpgsql security definer set search_path = public as $$
declare f record; n integer := 0;
begin
  perform set_config('app.moderation', '1', true);
  for f in select * from public.moderation_flags where status = 'advertida' and deadline_at is not null and deadline_at <= now() for update loop
    execute format('update public.%I set moderation_hidden = true where id = $1', f.target_table) using f.target_id;
    update public.moderation_flags set status = 'ocultada', hidden_at = now() where id = f.id;
    perform public.moderation_notify(f.house_id, 'O prazo da advertência terminou e um anúncio foi ocultado até o ajuste. Veja os detalhes e como contestar.');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.moderation_enforce() from public, anon, authenticated;

-- ============ 8) Administração
create or replace function public.admin_moderation_list(p_status text default null)
returns table (id uuid, house_id uuid, house_name text, target_table text, target_id uuid, reason text, excerpt text, status text, outcome text,
  created_at timestamptz, orientation_at timestamptz, warned_at timestamptz, deadline_at timestamptz, hidden_at timestamptz,
  contested_at timestamptz, contest_text text, contest_decision text, admin_note text, adaptation_start timestamptz, adaptation_days integer)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  perform public.moderation_enforce();
  return query
    select f.id, f.house_id, h.name, f.target_table, f.target_id, f.reason, f.excerpt, f.status, f.outcome, f.created_at, f.orientation_at, f.warned_at,
      f.deadline_at, f.hidden_at, f.contested_at, f.contest_text, f.contest_decision, f.admin_note, s.adaptation_start, s.adaptation_days
    from public.moderation_flags f join public.houses h on h.id = f.house_id cross join public.moderation_settings s
    where p_status is null or f.status = p_status
    order by (f.status = 'contestada') desc, (f.status = 'pendente') desc, f.created_at desc limit 300;
end $$;

create or replace function public.admin_moderation_start_adaptation()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  update public.moderation_settings set adaptation_start = coalesce(adaptation_start, now()) where id returning adaptation_start into v;
  return v;
end $$;

create or replace function public.admin_moderation_scan()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return public.moderation_scan();
end $$;

create or replace function public.admin_moderation_act(p_flag uuid, p_action text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  f public.moderation_flags; s public.moderation_settings; in_adapt boolean; v_deadline timestamptz; hrs text;
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Observação muito longa.'; end if;
  select * into f from public.moderation_flags where id = p_flag for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if f.status = 'encerrada' then raise exception 'Este registro já foi encerrado.'; end if;
  select * into s from public.moderation_settings where id;
  in_adapt := s.adaptation_start is null or now() < s.adaptation_start + make_interval(days => s.adaptation_days);
  perform set_config('app.moderation', '1', true);

  if p_action = 'orientar' then
    if f.status not in ('pendente', 'orientada') then raise exception 'Este registro já passou da fase de orientação.'; end if;
    update public.moderation_flags set status = 'orientada', orientation_at = now(), admin_note = coalesce(p_note, admin_note), handled_by = auth.uid() where id = f.id;
    perform public.moderation_notify(f.house_id, 'Dica de ajuste no seu anúncio: veja a orientação educativa do Ilê Conecta.');
    return 'orientada';

  elsif p_action = 'advertir' then
    if f.status not in ('pendente', 'orientada') then raise exception 'Este registro já recebeu advertência.'; end if;
    if in_adapt and f.reason = 'promessa' then raise exception 'Estamos no período de adaptação: neste período só é possível orientar, sem advertência.'; end if;
    v_deadline := now() + case f.reason when 'contato_antigo' then interval '15 days' else interval '72 hours' end;
    update public.moderation_flags set status = 'advertida', warned_at = now(), deadline_at = v_deadline, admin_note = coalesce(p_note, admin_note), handled_by = auth.uid() where id = f.id;
    hrs := case f.reason when 'contato_antigo' then '15 dias' else '72 horas' end;
    perform public.moderation_notify(f.house_id, 'Notificação de advertência e ajuste de conteúdo: você tem ' || hrs || ' para corrigir um anúncio. Veja os detalhes.');
    return 'advertida';

  elsif p_action = 'ocultar' then
    if f.status not in ('advertida', 'contestada') then raise exception 'Só é possível ocultar depois da advertência.'; end if;
    execute format('update public.%I set moderation_hidden = true where id = $1', f.target_table) using f.target_id;
    update public.moderation_flags set status = 'ocultada', hidden_at = coalesce(hidden_at, now()), admin_note = coalesce(p_note, admin_note), handled_by = auth.uid() where id = f.id;
    perform public.moderation_notify(f.house_id, 'Um anúncio foi ocultado até o ajuste. Veja os detalhes e como contestar.');
    return 'ocultada';

  elsif p_action = 'manter' then
    if f.status <> 'contestada' then raise exception 'Só dá para manter a decisão de uma contestação.'; end if;
    update public.moderation_flags set status = case when hidden_at is not null then 'ocultada' else 'advertida' end,
      contest_decision = 'mantida', admin_note = coalesce(p_note, admin_note), handled_by = auth.uid(),
      deadline_at = case when hidden_at is null then greatest(deadline_at, now() + interval '24 hours') else deadline_at end where id = f.id;
    perform public.moderation_notify(f.house_id, 'Analisamos a sua contestação e a decisão foi mantida. Veja a resposta.');
    return 'mantida';

  elsif p_action = 'encerrar' then
    execute format('update public.%I set moderation_hidden = false where id = $1', f.target_table) using f.target_id;
    update public.moderation_flags set status = 'encerrada', closed_at = now(), handled_by = auth.uid(), admin_note = coalesce(p_note, admin_note),
      outcome = case when f.status = 'contestada' then 'contestacao_aceita' else 'dispensado' end where id = f.id;
    if f.status in ('advertida', 'ocultada', 'contestada') then
      perform public.moderation_notify(f.house_id, 'O registro sobre o seu anúncio foi encerrado. Nenhuma pendência.');
    end if;
    return 'encerrada';
  end if;
  raise exception 'Ação inválida.';
end $$;

-- ============ 9) Casa: ver o que foi sinalizado e contestar (7 dias corridos)
create or replace function public.my_moderation_flags()
returns table (id uuid, house_name text, target_table text, reason text, excerpt text, status text, created_at timestamptz, orientation_at timestamptz,
  warned_at timestamptz, deadline_at timestamptz, hidden_at timestamptz, contested_at timestamptz, contest_text text, contest_decision text,
  contest_until timestamptz, admin_note text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  perform public.moderation_enforce();
  return query
    select f.id, h.name, f.target_table, f.reason, f.excerpt, f.status, f.created_at, f.orientation_at, f.warned_at, f.deadline_at, f.hidden_at,
      f.contested_at, f.contest_text, f.contest_decision, case when f.warned_at is null then null else f.warned_at + interval '7 days' end, f.admin_note
    from public.moderation_flags f join public.houses h on h.id = f.house_id
    where h.owner_id = auth.uid() and f.status in ('orientada', 'advertida', 'ocultada', 'contestada')
       or (h.owner_id = auth.uid() and f.status = 'encerrada' and f.closed_at > now() - interval '30 days' and f.warned_at is not null)
    order by f.created_at desc limit 100;
end $$;

create or replace function public.contest_moderation_flag(p_flag uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.moderation_flags; adm record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if coalesce(char_length(btrim(p_text)), 0) < 10 or char_length(p_text) > 2000 then raise exception 'Explique a sua contestação em pelo menos 10 caracteres (máximo 2000).'; end if;
  select f2.* into f from public.moderation_flags f2 join public.houses h on h.id = f2.house_id where f2.id = p_flag and h.owner_id = auth.uid() for update of f2;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if f.status not in ('advertida', 'ocultada') then raise exception 'Este registro não aceita contestação agora.'; end if;
  if f.contested_at is not null then raise exception 'Este registro já foi contestado.'; end if;
  if now() > f.warned_at + interval '7 days' then raise exception 'O prazo de 7 dias para contestar terminou.'; end if;
  update public.moderation_flags set status = 'contestada', contested_at = now(), contest_text = btrim(p_text) where id = f.id;
  for adm in select user_id from public.admins loop
    insert into public.notifications (user_id, text, href) values (adm.user_id, 'Nova contestação de moderação aguardando análise.', '/admin');
  end loop;
end $$;

-- ============ 10) Permissões
revoke all on function public.moderation_notify(uuid, text), public.moderation_promise_watch(), public.moderation_scan(), public.moderation_enforce(), public.moderation_hidden_guard() from public, anon, authenticated;
revoke all on function public.admin_moderation_list(text), public.admin_moderation_start_adaptation(), public.admin_moderation_scan(), public.admin_moderation_act(uuid, text, text),
  public.my_moderation_flags(), public.contest_moderation_flag(uuid, text) from public, anon;
grant execute on function public.admin_moderation_list(text), public.admin_moderation_start_adaptation(), public.admin_moderation_scan(), public.admin_moderation_act(uuid, text, text),
  public.my_moderation_flags(), public.contest_moderation_flag(uuid, text) to authenticated;
revoke all on table public.moderation_flags, public.moderation_settings from public, anon, authenticated;

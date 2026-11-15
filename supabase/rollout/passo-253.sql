-- PASSO 253: 0121_moderacao_fase2 — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

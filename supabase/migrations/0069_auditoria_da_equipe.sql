-- 0069 — F6 da auditoria 31.3: trilha de auditoria da equipe da casa (Blueprint §15 e §26).
-- Decisões do proprietário (2026-11-10): o dono da casa vê o histórico da própria equipe; a administração consulta para investigar
-- denúncias e disputas, e cada consulta fica registrada; o histórico é guardado por 12 meses e depois apagado.
-- Registra: convite criado/cancelado, aceite, pausa, reativação, remoção, mudança de permissões e de nome.
-- Não registra conteúdo de conversa nem dado sensível: só quem fez, o que, em quem, quando e a casa.
-- Idempotente: pode rodar mais de uma vez.

create table if not exists public.staff_audit (
  id bigint generated always as identity primary key,
  house_id uuid not null,                       -- sem FK de propósito: o gatilho de remoção também roda quando a casa é apagada
  action text not null check (action in (
    'convite_criado', 'convite_cancelado', 'aceito', 'pausado', 'reativado', 'removido',
    'permissoes_alteradas', 'nome_alterado', 'admin_consultou')),
  actor_id uuid,
  actor_role text not null check (actor_role in ('dono', 'equipe', 'admin', 'sistema', 'outro')),
  target_user_id uuid,
  target_name text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '12 months'
);
create index if not exists staff_audit_house_idx on public.staff_audit (house_id, created_at desc);
create index if not exists staff_audit_purge_idx on public.staff_audit (purge_after);

alter table public.staff_audit enable row level security;
revoke all on table public.staff_audit from public, anon, authenticated;
grant select on table public.staff_audit to authenticated;
-- O dono lê o histórico da própria casa, menos as consultas da administração (não revelar uma investigação em curso).
drop policy if exists staff_audit_owner_read on public.staff_audit;
create policy staff_audit_owner_read on public.staff_audit for select to authenticated
  using (action <> 'admin_consultou' and public.is_house_owner(house_id));

-- Papel de quem agiu (calculado no momento do fato).
create or replace function public.staff_audit_role(p_house uuid, p_target uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return 'sistema'; end if;
  if exists (select 1 from public.houses where id = p_house and owner_id = me) then return 'dono'; end if;
  if p_target is not null and me = p_target then return 'equipe'; end if;
  if exists (select 1 from public.admins where user_id = me) then return 'admin'; end if;
  return 'outro';
end $$;
revoke all on function public.staff_audit_role(uuid, uuid) from public, anon, authenticated;

create or replace function public.staff_audit_log(
  p_house uuid, p_action text, p_target uuid, p_name text, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff_audit (house_id, action, actor_id, actor_role, target_user_id, target_name, details)
  values (p_house, p_action, auth.uid(), public.staff_audit_role(p_house, p_target), p_target, p_name, coalesce(p_details, '{}'::jsonb));
end $$;
revoke all on function public.staff_audit_log(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- Convites.
create or replace function public.trg_staff_invites_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.staff_audit_log(new.house_id, 'convite_criado', null, new.name, jsonb_build_object('perms', to_jsonb(new.perms)));
  elsif tg_op = 'DELETE' and old.used_at is null then
    perform public.staff_audit_log(old.house_id, 'convite_cancelado', null, old.name, jsonb_build_object('perms', to_jsonb(old.perms)));
  end if;
  return null;
end $$;
revoke all on function public.trg_staff_invites_audit() from public, anon, authenticated;
drop trigger if exists trg_staff_invites_audit on public.house_staff_invites;
create trigger trg_staff_invites_audit after insert or delete on public.house_staff_invites
  for each row execute function public.trg_staff_invites_audit();

-- Vínculos da equipe.
create or replace function public.trg_house_staff_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.staff_audit_log(new.house_id, 'aceito', new.user_id, new.name, jsonb_build_object('perms', to_jsonb(new.perms)));
  elsif tg_op = 'DELETE' then
    perform public.staff_audit_log(old.house_id, 'removido', old.user_id, old.name, jsonb_build_object('perms', to_jsonb(old.perms)));
  else
    if new.active is distinct from old.active then
      perform public.staff_audit_log(new.house_id, case when new.active then 'reativado' else 'pausado' end, new.user_id, new.name, '{}'::jsonb);
    end if;
    if new.perms is distinct from old.perms then
      perform public.staff_audit_log(new.house_id, 'permissoes_alteradas', new.user_id, new.name,
        jsonb_build_object('antes', to_jsonb(old.perms), 'depois', to_jsonb(new.perms)));
    end if;
    if new.name is distinct from old.name then
      perform public.staff_audit_log(new.house_id, 'nome_alterado', new.user_id, new.name, jsonb_build_object('antes', old.name, 'depois', new.name));
    end if;
  end if;
  return null;
end $$;
revoke all on function public.trg_house_staff_audit() from public, anon, authenticated;
drop trigger if exists trg_house_staff_audit on public.house_staff;
create trigger trg_house_staff_audit after insert or update or delete on public.house_staff
  for each row execute function public.trg_house_staff_audit();

-- Consulta da administração: exige motivo e deixa registro (invisível para o dono da casa).
create or replace function public.admin_staff_audit(p_house uuid, p_reason text)
returns setof public.staff_audit language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 or char_length(p_reason) > 300 then
    raise exception 'Informe o motivo da consulta (5 a 300 caracteres).';
  end if;
  if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa não encontrada.'; end if;
  perform public.staff_audit_log(p_house, 'admin_consultou', null, null, jsonb_build_object('motivo', btrim(p_reason)));
  return query select * from public.staff_audit where house_id = p_house order by created_at desc, id desc limit 500;
end $$;
revoke all on function public.admin_staff_audit(uuid, text) from public, anon;
grant execute on function public.admin_staff_audit(uuid, text) to authenticated;

-- Retenção de 12 meses.
do $$
begin
  perform cron.schedule('purge-staff-audit', '45 3 * * *', 'delete from public.staff_audit where purge_after < now()');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

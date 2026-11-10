-- PASSO 22 de 23: 0069 c: gatilhos de convites e da equipe
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

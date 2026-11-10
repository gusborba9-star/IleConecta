-- PASSO 21 de 23: 0069 b: funções internas que gravam o registro
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

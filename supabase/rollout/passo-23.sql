-- PASSO 23 de 23: 0069 d: consulta da administração (com motivo) e limpeza em 12 meses
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

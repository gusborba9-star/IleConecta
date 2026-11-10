-- Reversão da 0069 (auditoria da equipe): desliga a gravação e a consulta; MANTÉM a tabela e os registros já feitos.
-- Para apagar também o histórico, descomente a última linha (decisão do proprietário). Idempotente.
drop trigger if exists trg_staff_invites_audit on public.house_staff_invites;
drop trigger if exists trg_house_staff_audit on public.house_staff;
drop function if exists public.admin_staff_audit(uuid, text);
drop function if exists public.trg_staff_invites_audit();
drop function if exists public.trg_house_staff_audit();
drop function if exists public.staff_audit_log(uuid, text, uuid, text, jsonb);
drop function if exists public.staff_audit_role(uuid, uuid);
do $$ begin perform cron.unschedule('purge-staff-audit'); exception when others then null; end $$;
-- drop table if exists public.staff_audit;

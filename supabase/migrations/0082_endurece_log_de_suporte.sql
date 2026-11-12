-- 0082 — Suporte: endurecimento apontado pela auditoria final (search_path fixo e sem execução direta na função do gatilho do registro imutável).
alter function public.support_log_immutable() set search_path = public;

revoke all on function public.support_log_immutable() from public, anon, authenticated;

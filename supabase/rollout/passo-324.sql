-- PASSO 324: 0156_saude_rotina_em_execucao_nao_e_falha — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0156 — Saúde da plataforma: rotina que está rodando naquele instante não é falha.
-- Achado no primeiro uso em produção (17/11/2026): a conferência contava como falha toda execução com status diferente de 'succeeded'.
-- Uma rotina em andamento ('starting'/'running') — inclusive a própria conferência, que roda dentro do pg_cron — entrava na conta e gerava
-- aviso falso de "rotina falhou" no sino do dono. Agora só conta status 'failed'.
-- Pode rodar de novo sem problema.

create or replace function public.health_cron() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then return r; end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last_run', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
      'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
      'runs_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
      'failed_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'failed'),
      'failed_30min', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '30 minutes' and d.status = 'failed')
    ) order by j.jobname), '[]'::jsonb) from cron.job j $q$ into r;
  return r;
end $$;

revoke all on function public.health_cron() from public, anon, authenticated;

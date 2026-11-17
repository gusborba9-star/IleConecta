-- PASSO 317: 0151_chamados_retencao_24_meses — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0151 — Chamados e denúncias: retenção de 24 meses depois de encerrados, para todos (resposta do advogado, 17/11/2026).
-- Antes: 12 meses, ou 24 quando havia prova ou tipo grave. Agora: sempre 24 meses.
-- A função é ajustada no lugar (lendo a definição atual), para não desfazer a trava por módulo da 0139. Pode rodar de novo sem problema.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_support_decide';
  if d is null then raise exception 'admin_support_decide não encontrada'; end if;
  if position('else interval ''12 months'' end' in d) > 0 then
    execute replace(d, 'else interval ''12 months'' end', 'else interval ''24 months'' end');
  end if;
end $$;

-- chamados já encerrados com prazo de 12 meses passam a 24 (nunca diminui prazo)
update public.support_cases set purge_after = resolved_at + interval '24 months'
 where resolved_at is not null and purge_after is not null and purge_after < resolved_at + interval '24 months';

-- PASSO 209: 0110_plano_gratis_valor — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0110 — Plano Grátis, parte 1: o novo valor do tipo house_plan (decisões do proprietário, 14/11/2026).
-- O `base` continua sendo o Essencial pago (é assim que toda a cobrança já o trata); `gratis` é o novo degrau de entrada, abaixo dele.
-- Fica sozinho nesta migration: um valor novo de enum só pode ser usado depois que o comando termina (a 0111 usa).
-- Estado de produção antes desta migration: 3 casas (1 em base sem assinatura, 2 em maximo).

alter type public.house_plan add value if not exists 'gratis' before 'base';

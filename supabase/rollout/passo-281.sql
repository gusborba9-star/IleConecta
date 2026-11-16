-- PASSO 281: 0130_central_de_pendencias_casa — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0130 — Central de pendências da CASA (Fase 5). SÓ LEITURA, sem tabela nova.
-- Uma função única para a titular e para a equipe: lê as tabelas originais na hora, só da própria casa.
--   * Titular: vê tudo da casa. Equipe: só o que a permissão dela libera (conversas, pedidos, membros).
--   * Cobrança, plano, reembolso, avaliações, moderação, suporte e cadastro são SÓ da titular (a equipe nunca vê pagamentos).
--   * O que aparece depende do que a casa USA (assistente ligada, área de membros, pedidos), não do nome do plano.
-- Prazos padrão (horas) em house_pending_hours(): fonte única.

create or replace function public.house_pending_hours(p_kind text)
returns numeric language sql immutable set search_path = public as $$
  select case p_kind
    when 'conversa_sem_resposta' then 24
    when 'conversa_quieta' then 0.25        -- só aparece depois de 15 min sem resposta (evita ruído de conversa em andamento)
    when 'assunto_da_assistente' then 12
    when 'pedido_para_iniciar' then 48
    when 'atendimento_passou' then 24
    when 'reembolso_da_casa' then 48
    when 'avaliacao_sem_resposta' then 168
    else null end;
$$;

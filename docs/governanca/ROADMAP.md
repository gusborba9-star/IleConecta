# ILÊ CONECTA — ROADMAP OFICIAL

- Data de consolidação: 03/11/2026
- Autoridade: `../BLUEPRINT_DEFINITIVO.md`
- Status: plano diretor inicial; progresso depende de evidências e validação.
- Natureza: documento de priorização, não ordem automática de execução.

## 1. Objetivo

Transformar o Blueprint definitivo em uma sequência finita de validação e evolução. O Roadmap não reabre a concepção do produto, não presume que funcionalidades estejam ausentes e não autoriza reconstrução de ferramentas existentes.

## 2. Regras de condução

1. Antes de implementar, auditar o que já existe e identificar seu ownership.
2. Reutilizar e integrar componentes existentes; não duplicar fluxos.
3. Separar evidência de código, teste isolado e validação ponta a ponta.
4. Preservar dados e transações históricas.
5. Não alterar comportamento fora da ordem aprovada.
6. Mudanças de produto, preço, comissão, provedor ou política exigem aprovação específica.
7. Migrations, operações financeiras reais, merge, deploy e produção exigem autorização expressa.
8. Atualizar este Roadmap somente após evidência verificável; não registrar progresso por declaração isolada.

## 3. Fases

### Fase 0 — Baseline e integridade documental

**Objetivo:** estabelecer referência imutável e reduzir contradições.

Escopo:
- Confirmar branch, commit, deployment e estado do repositório.
- Manter Blueprint definitivo como documento mestre.
- Centralizar documentos subordinados em `docs/` e subdiretórios temáticos.
- Inventariar documentos antigos e marcar explicitamente os superados, sem apagar histórico sem autorização.
- Registrar versões vigentes de regras comerciais e decisões pendentes.

Saída:
- Links e SHAs dos documentos oficiais.
- Inventário dos documentos legados e sua precedência.
- Nenhuma mudança de código ou comportamento.

### Fase 1 — Reconciliação técnica e operacional

**Objetivo:** descobrir o estado real antes de planejar correções.

Prioridades:
1. Reconciliação de migrations do repositório com histórico e schema real do Supabase.
2. Segurança multi-tenant, RLS, exposição de perfis/casas e Storage.
3. Persistência, recuperação, JSON inválido e consistência entre estado local e remoto.
4. Pagamentos: Stripe Connect para marketplace; Efí para monetização própria; Payment Core, adaptadores, identidade do provedor, webhooks, ledger e conciliação.
5. Regras de comissão históricas (17%) versus regras aprovadas (15%/4%).
6. Agenda, reserva temporária, checkout, concorrência, expiração e confirmação atrasada.
7. Assistente: controles independentes, modos, coleta de dados e handoff.
8. Equipe, convites, papéis e permissões.
9. CRM integrado e central de pendências.
10. Aceite dos Termos: persistência, prova de aceite, uma única solicitação pós-login e ausência de telas normativas recorrentes.
11. Cobrança de planos, adicionais, créditos e divulgação, incluindo modalidades recorrentes e manuais.
12. Observabilidade, backups, recuperação e auditoria.

Saída:
- Matriz por domínio com evidências, riscos, cobertura de testes e classificação de estado.
- Lista de lacunas reais, sem confundir ausência de prova com ausência de implementação.
- Plano de correção priorizado por risco.
- Nenhuma correção executada sem ordem específica.

### Fase 2 — Integridade de segurança e dados

**Objetivo:** fechar riscos críticos identificados na Fase 1.

Ordem de prioridade:
- Isolamento multi-tenant e autorização no backend.
- Integridade financeira e validação de webhooks.
- Integridade de agenda, vagas, reservas e pedidos.
- Privacidade e minimização de dados pessoais sensíveis.
- Sessões, permissões de equipe e ações administrativas.
- Persistência, idempotência, logs e recuperação.

Critério de saída:
- Testes automatizados negativos e positivos.
- Evidências RLS por papel/tenant.
- Testes de concorrência e idempotência.
- Nenhum segredo privilegiado exposto.
- Aprovação CTO/proprietário conforme criticidade.

### Fase 3 — Validação ponta a ponta das jornadas centrais

**Objetivo:** provar integração dos módulos já existentes.

Jornadas mínimas:
1. Visitante descobre casa e oferta pública.
2. Usuário autentica e realiza aceite único dos Termos.
3. Cliente inicia conversa e o handoff preserva contexto.
4. Assistente completa venda quando autorizada.
5. Assistente encaminha intenção quando execução comercial está desativada.
6. Cliente contrata serviço com horário e a agenda bloqueia sem conflito.
7. Cliente compra ritual coletivo pelo fluxo interno obrigatório.
8. Reserva temporária expira e libera capacidade.
9. Webhook confirma pagamento, inclusive duplicado/atrasado.
10. Cliente acompanha pedido, pagamento e solicitação de suporte.
11. Casa acompanha a pessoa no CRM sem duplicação de dados.
12. Titular convida colaborador e concede apenas permissões autorizadas.
13. Casa contrata plano mensal ou anual, e capacidades/franquias são aplicadas por ciclo corretamente.
14. Vagas adicionais de equipe são cobradas junto à assinatura principal, em ciclo mensal ou anual, sem assinaturas independentes por colaborador.
15. Divulgação comprada é entregue e identificada como patrocinada.

Critério de saída:
- Cenários executados em ambiente controlado.
- Evidências de frontend, backend, banco e provedor quando aplicável.
- Casos de falha, repetição e concorrência cobertos.
- Nenhum estado crítico inferido de mensagem visual.

### Fase 4 — Modelo comercial, financeiro e jurídico operacional

**Objetivo:** alinhar regra aprovada, implementação, contrato e fluxo real.

Entregas:
- Versionamento de taxas por transação.
- Reconciliação de comissões 15%/4%.
- Definição formal de tarifas do provedor, repasses, cancelamentos, reembolsos e disputas.
- Validação jurídica de intermediação, responsabilidade e termos da casa.
- Regras finais de planos, equipe, créditos IA e divulgação.
- Validar planos anuais (12 meses por 10 mensalidades) e vagas anuais de equipe, incluindo ciclo, renovação, upgrade/downgrade, prorrata, cancelamento e preservação de preço contratado.
- Validar renovação mensal das franquias durante a vigência anual, sem antecipação ou acúmulo.
- Testes de cobrança, estorno e conciliação em sandbox.

Critério de saída:
- Parecer jurídico aplicável.
- Contratos e textos aprovados.
- Simulações financeiras conciliadas.
- Nenhuma promessa de retenção/escrow sem produto compatível.
- Autorização explícita antes de ativar cobrança real.

### Fase 5 — CRM, inteligência e operação avançada

**Objetivo:** consolidar visão operacional sem duplicar fontes de verdade.

Entregas:
- Timeline por pessoa/casa referenciando eventos originais.
- Central de pendências.
- Segmentação e filtros conforme finalidade e permissões.
- Indicadores com definições e origem de dados.
- Auditoria e gestão administrativa.
- Ferramentas de suporte e resolução de ocorrências.

Critério de saída:
- Métricas reproduzíveis.
- Isolamento entre casas comprovado.
- Nenhuma cópia paralela de pedidos, conversas ou transações como fonte oficial.

### Fase 6 — Otimização, escala e crescimento

**Objetivo:** melhorar performance e eficiência após integridade comprovada.

Frentes:
- Core Web Vitals e desempenho móvel.
- Custo, latência e qualidade da IA.
- Busca, feed e distribuição.
- Observabilidade, filas, retries e alertas.
- Acessibilidade e consistência de UX.
- Testes de carga e capacidade.
- Experimentos de conversão sem comprometer transparência.

Critério de saída:
- Metas quantitativas definidas a partir de baseline.
- Testes de carga e monitoramento.
- Plano de rollback e resposta a incidentes.

## 3.1 Trilha financeira multi-provedor aprovada

Esta trilha registra a arquitetura aprovada, mas não autoriza execução automática nem amplia a ordem EXEC-01 já emitida.

1. **EXEC-01 — desacoplamento Stripe:** concluir e auditar o Payment Core e Stripe Adapter, sem alterar o fluxo comercial aprovado.
2. **EXEC-02 — Efí para monetização própria:** implementar Efí Adapter apenas para planos/assinaturas e cobranças próprias, após auditoria do código existente. Homologar cartão recorrente, Pix Automático e cobranças avulsas; não ativar produção.
3. **EXEC-03 — roteamento financeiro:** permitir seleção administrativa por categoria e modalidade, com validação de capacidades, conexão, ambiente e provedor de origem. Não permitir troca de provedor em operações existentes.
4. **EXEC-04 — administração central:** consolidar controles administrativos por domínio, incluindo provedores, preços, planos, permissões e auditoria, reutilizando telas/capacidades existentes.
5. **EXEC-05 — validação integrada:** executar jornadas de ponta a ponta, incluindo renovação, falha, cancelamento, reembolso/devolução, webhooks, idempotência, conciliação e isolamento de permissões.

A ordem é dependente de evidências: se o painel já possuir parte desses controles, integrar e validar em vez de reconstruir. EXEC-02 não começa antes da validação da EXEC-01. Roteamento e painel não devem antecipar a integração homologada.

## 4. Priorização

Prioridade P0: risco de segurança, vazamento, perda de dados, cobrança incorreta, pagamento indevido, dupla reserva ou estado financeiro falso.

P1: jornadas centrais interrompidas, handoff perdido, convite/permissão incorreta, inconsistência de CRM e aceite jurídico não rastreável.

P2: qualidade de UX, desempenho, automação, indicadores e eficiência operacional.

P3: otimizações e expansão sem risco estrutural.

## 5. Pendências que não podem ser inventadas

- Matriz definitiva de recursos/limites por plano.
- Preços e posições de destaque/impulsionamento.
- Política de expiração/acúmulo/ordem de consumo de créditos IA.
- Tarifas e responsabilidades financeiras por modalidade.
- Validação operacional da Efí para monetização própria e das capacidades específicas de cada modalidade; Stripe permanece definido para marketplace.
- Política de cancelamento e reembolso validada juridicamente.
- Retenção de dados e prazos legais por categoria.
- Metas quantitativas de escala e desempenho.

## 6. Controle de progresso

Cada item recebe: ID, fase, prioridade, estado, responsável, dependências, evidências, testes, riscos, decisão necessária e data de validação.

Estados permitidos: não iniciado, em auditoria, evidência parcial, pronto para execução, em execução autorizada, implementado, testado, validado integrado, bloqueado, não aplicável.

Não marcar fase concluída se houver P0 aberto ou se os critérios de saída não estiverem demonstrados.

## 7. Declaração de governança

O Roadmap é o plano mestre de evolução. Não é uma lista para implementar tudo em sequência sem auditoria. A primeira obrigação é descobrir e validar o que já existe. Só então se autorizam correções específicas. O Blueprint permanece estável; o Roadmap registra ordem e estado.

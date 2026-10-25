# Ilê Conecta — Arquitetura de Backend (proposta)

> **Estado:** proposta técnica para revisão do CTO; não descreve um backend já implementado. A inspeção documental não confirmou schema existente no Supabase, APIs server-side, processamento de webhook ou integração funcional com Asaas. Não foram feitas alterações em banco/infraestrutura nesta DOC-02.

## 1. Estado observado

- Frontend: Vite + React + TypeScript; ver [README](../README.md) e configurações no repositório.
- Estado e operações de demonstração: [AppContext.tsx](../src/contexts/AppContext.tsx).
- Persistência local: [storage.ts](../src/lib/storage.ts), usa `localStorage`.
- Dados de demonstração: [mockData.ts](../src/lib/mockData.ts), contém contas e senhas fictícias em texto simples.
- Compra simulada: [RitualPurchaseModal.tsx](../src/components/ritual/RitualPurchaseModal.tsx), usa timer local e informa “Pagamento simulado no ambiente demo”; exibe métodos de cartão/Pix e percentuais de demonstração.
- O manifesto declarar SDK de Supabase ou Stripe não comprova que serviços, tabelas ou pagamentos estão funcionando.
- Nenhum schema de banco foi verificado nesta execução. Não inferir tabelas existentes.

Conclusão: o material observado sustenta classificar o estado atual como protótipo frontend/demonstração, não como backend financeiro pronto para produção.

## 2. Princípios arquiteturais propostos

1. O frontend é não confiável. Não decide autorização, preço final, comissão, vagas, pagamento confirmado ou elegibilidade de repasse.
2. Toda operação sensível é validada no servidor e associada à identidade autenticada.
3. Acesso negado por padrão; autorização por recurso e ação, não apenas por tipo de usuário.
4. Persistência relacional transacional para dados que exigem consistência.
5. Eventos externos são verificados, idempotentes, auditáveis e reconciliáveis.
6. Segredos nunca são enviados ao bundle do cliente nem incluídos em repositório/logs.
7. Sandbox separado de produção, com credenciais e dados isolados.
8. Contratos, modelo de dados e migrações são versionados e revisados antes de execução.

## 3. Componentes e responsabilidades (proposta)

| Componente lógico | Responsabilidade | Limite de confiança |
|---|---|---|
| SPA frontend | Apresentação, formulários e chamadas de API | Não confiável; qualquer payload pode ser adulterado |
| API/backend | Identidade, autorização, validação, casos de uso e transações | Ponto confiável de decisão; valida toda entrada |
| Serviço de identidade | Login, sessão, recuperação e revogação | Emissor/validador de identidade; provedor ainda a escolher/aprovar |
| Banco relacional | Persistência e constraints | Acesso apenas por backend/roles autorizadas; não expor chaves privilegiadas |
| Serviço de pagamentos | Cria cobranças e solicita operações permitidas ao provedor | Segredos do provedor só server-side |
| Endpoint de webhook | Verifica autenticidade, persiste evento e agenda processamento | Entrada externa não confiável até verificação |
| Worker/fila (se aprovado) | Processa eventos, retries e conciliação | Conta de serviço de privilégio mínimo |
| Adaptador Asaas | Traduz contrato externo para modelo interno | Sandbox até autorização; capacidades contratuais não presumidas |
| Observabilidade/auditoria | Logs, métricas, alertas e eventos de auditoria | Dados mínimos, acesso restrito e retenção definida |

A escolha de runtime, framework backend, provedor de identidade, fila e estratégia de deployment é **decisão pendente do CTO**. Supabase/PostgreSQL é uma opção a avaliar, não uma arquitetura aprovada nem evidência de schema existente.

## 4. Modelo lógico de dados proposto (não é schema verificado)

As entidades abaixo são conceitos para desenho e revisão. Não afirmam que tabelas já existam.

- **Identity/User:** identidade externa/interna, estado, timestamps; nunca armazenar senha em texto claro.
- **House:** perfil da casa, estado de verificação, responsável e dados públicos.
- **HouseMembership:** usuário, casa, papel, estado e validade; permite delegação controlada.
- **Activity/Event:** casa proprietária, descrição, modalidade, início/fim, status, capacidade, preço e política versionada.
- **Reservation:** participante, atividade, quantidade, estado, preço e termos snapshot, expiração, chave idempotente.
- **Payment:** referência interna, provedor, ID externo, valor, moeda, estado interno/externo, timestamps e metadados mínimos.
- **PaymentEvent/WebhookInbox:** ID do evento, provedor, assinatura/verificação, payload restrito ou referência segura, horário recebido, resultado e tentativas.
- **Refund:** pagamento original, valor, motivo/categoria, solicitante, aprovação, estado e referência externa.
- **Payout/Transfer:** beneficiário, montante, estado, janela de elegibilidade, referência externa e reconciliação.
- **LedgerEntry:** lançamentos imutáveis para valor bruto, comissão, reserva interna, tarifas, reembolso e repasse.
- **AuditLog:** ator, ação, recurso, motivo, timestamp, correlation ID e metadados mínimos.
- **Content/Message/Report:** conteúdo, participantes, denúncias e moderação, conforme escopo aprovado.
- **IdempotencyRecord/Outbox (se adotados):** chave, operação, resultado e publicação de eventos sem perda/duplicidade.

### Constraints e relacionamentos propostos
- Reserva referencia atividade e participante; pagamento referencia reserva ou obrigação explicitamente modelada.
- Casa e memberships controlam a propriedade/gestão de atividades.
- ID do provedor e ID de evento devem ser únicos dentro do escopo correto do provedor.
- Chaves de idempotência devem ser únicas por operação/ator/escopo definido.
- Ledger é append-only; correções usam lançamentos compensatórios, não edição silenciosa de histórico.
- Vagas disponíveis precisam de atualização atômica/constraint sob concorrência.
- Exclusão/anonimização deve respeitar retenção legal/financeira e não quebrar integridade de registros.

## 5. Identidade, autenticação, autorização e isolamento

### Requisitos propostos
- Usar provedor de identidade aprovado; senhas, se existirem, tratadas por mecanismo seguro e nunca persistidas em texto claro.
- Validar sessão/token no backend; rotação, expiração, logout e recuperação com política explícita.
- Separar identidade da pessoa e associação a casas.
- RBAC/ABAC conforme papéis e propriedade do recurso; toda consulta/escrita sensível deve incluir o escopo autorizado.
- Operações administrativas elevadas exigem privilégio mínimo, justificativa e trilha.
- Não confiar em `userId`, `houseId`, `role`, valor ou estado enviados pelo cliente sem validação server-side.
- Proteger dados pessoais por minimização, finalidade, controle de acesso, retenção e processo de exercício de direitos aplicáveis.

### Testes obrigatórios
- Pessoa A não lê nem modifica reservas/mensagens de pessoa B.
- Operador de Casa A não lê nem modifica dados privados de Casa B.
- Participante não executa ações de operador ou administrador.
- Remoção/revogação de membership bloqueia acesso subsequente.
- ID inválido ou manipulado não contorna autorização.
- Logs e respostas não revelam segredo, token, senha ou dados pessoais não necessários.

## 6. Criação e acompanhamento de pagamentos (proposta)

1. Backend valida atividade publicada, preço vigente, disponibilidade, política e identidade.
2. Transação cria reserva pendente com preço/percentuais/termos versionados e idempotency key.
3. Backend solicita cobrança Pix ao adaptador do provedor com referência interna única.
4. Armazena identificador e estado retornado, sem expor segredos.
5. Cliente recebe apenas dados de pagamento necessários e seguros.
6. Pagamento só é confirmado após evento confiável verificado e reconciliação de valor, moeda, referência e status.
7. Backend atualiza pagamento/reserva de forma atômica e publica notificações idempotentes.
8. Tarefas de conciliação consultam relatórios/estado do provedor e registram discrepâncias.
9. Estados desconhecidos ou divergentes vão para fila de exceção/manual review; não assumir sucesso.

## 7. Webhooks, idempotência e reprocessamento

- Confirmar mecanismo oficial de autenticação/assinatura/origem documentado pelo provedor; não inventar um cabeçalho ou algoritmo.
- Validar origem/autenticidade antes de aceitar evento como autoritativo.
- Persistir ID externo do evento e metadados mínimos antes do processamento; impedir duplicidade por constraint única.
- Responder ao provedor conforme seu contrato e processar trabalho demorado de forma assíncrona se necessário.
- Não depender da ordem de chegada; consultar estado atual do provedor quando o evento for ambíguo.
- Cada transição deve ser atômica e idempotente; reprocessar não duplica confirmação, reembolso ou repasse.
- Política de retry com backoff, limite e fila de exceção; alertar falhas persistentes.
- Armazenar payloads de forma minimizada e com retenção/controle de acesso; nunca gravar segredos.
- Testar evento válido, assinatura inválida, repetido, atrasado, fora de ordem, desconhecido e falha transitória.

## 8. Estados e consistência entre domínio e provedor

Estados de atividade, reserva, pagamento, reembolso e repasse devem ser entidades distintas. Um estado externo do provedor não deve ser copiado cegamente: usar mapeamento versionado e preservar o status original para diagnóstico. As máquinas de estado sugeridas em [Regras Financeiras](FINANCIAL_RULES.md) aguardam aprovação.

Regras de integridade propostas:
- transições inválidas são rejeitadas no servidor;
- confirmação financeira e reserva são atualizadas na mesma transação local;
- se um efeito externo não puder participar da transação, usar outbox/saga ou reconciliação explícita;
- reembolso não apaga o pagamento original; gera registro correlacionado;
- repasse não pode ocorrer antes do gate de elegibilidade aprovado;
- correções financeiras são compensatórias e auditáveis.

## 9. Segredos, ambientes e integração

- Asaas em Sandbox até autorização posterior do CTO.
- Segredos somente em secret manager/variáveis de ambiente server-side com controle de acesso; nunca em `VITE_*` ou bundle do browser.
- Separar chaves, URLs, dados e permissões entre local/dev, Preview, Sandbox e produção.
- Rotação/revogação documentada; princípio de menor privilégio.
- Logs redigem tokens, chaves, QR/Pix payloads sensíveis e dados pessoais desnecessários.
- Não assumir que o Asaas suporta split, retenção, contas vinculadas ou prazo desejado; confirmar documentação e contrato antes de fechar desenho.
- Não foi feita alteração de Supabase, Vercel, Asaas, domínio, DNS ou credencial na DOC-02.

## 10. Observabilidade, auditoria e recuperação

Proposta:
- logs estruturados com correlation ID, sem segredos;
- métricas para erro de API, latência, webhook atrasado/falho, divergência de conciliação, reserva expirada e falha de repasse;
- alertas para falhas repetidas e operações financeiras em estado desconhecido;
- trilha de auditoria de mudanças de perfil/permissão, atividade, preço, reserva, pagamento, reembolso e repasse;
- política de retenção e acesso aos logs aprovada;
- backup com acesso restrito e testes periódicos de restauração;
- runbooks de indisponibilidade do provedor, eventos duplicados, conciliação divergente e rollback;
- RPO/RTO e objetivos de serviço definidos pelo CTO, sem valores inventados nesta versão.

## 11. Estratégia de testes proposta

- Unitários: regras de comissão, arredondamento, estados, autorização.
- Integração: transações, constraints, persistência, APIs e adaptador de pagamento.
- Contrato: respostas/eventos do provedor conforme documentação vigente.
- Segurança: autorização negativa, isolamento, abuso de API, segredos em artefatos/logs.
- Concorrência: últimas vagas, cobranças duplicadas, reembolso e repasse concorrentes.
- Resiliência: timeout, retry, evento repetido/atrasado, falha parcial e reconciliação.
- E2E: cadastro → atividade → reserva → Pix Sandbox → webhook → confirmação → evento → elegibilidade → repasse simulado/permitido.
- Regressão: fluxos já aprovados em cada mudança.
- Preview: validação isolada por SHA antes de qualquer promoção.

Nenhum teste acima é declarado executado por este documento.

## 12. Referências de rastreabilidade

Requisitos de identidade e autorização: `ROLE-01`, `AUTH-01`, `SEC-ISO-01`. Pagamentos: `PAY-01`, `WEBHOOK-01`, `IDEMP-01`. Auditoria e operação: `AUDIT-01`, `PRIV-01`, `DEPLOY-PREVIEW-01`. A definição e os estados de cada requisito ficam na [matriz mestre](TRACEABILITY.md). Esses IDs são documentais e não comprovam implementação.

## 13. Decisões pendentes

1. Aprovar stack e padrão de API/backend.
2. Aprovar provedor de identidade e modelo de sessão.
3. Confirmar se Supabase/PostgreSQL será o banco e verificar schema real antes de qualquer migração.
4. Aprovar entidades, retenção, isolamento e autorização.
5. Confirmar capacidades/contrato do Asaas para Pix, split e repasses.
6. Aprovar máquinas de estado, cancelamentos e reembolsos.
7. Definir fila/outbox, observabilidade, RPO/RTO e política de incidentes.
8. Aprovar ambientes, gates de Preview e processo de lançamento.

**Este documento não autoriza implementação de backend, migração de banco, integração real nem deploy.**


## DOC-03 — Arquitetura financeira e ciclo de fundos (proposta; implementação pendente)

### 13. Invariantes de domínio

1. O cliente nunca determina comissão, parcela da casa, taxa, elegibilidade ou estado final de pagamento.
2. A base de 17%/83% é o valor bruto confirmado da transação, calculado em centavos inteiros.
3. Taxas do provedor são despesa da plataforma; nunca são subtraídas automaticamente dos 83% brutos da casa.
4. A reserva de 2% é interna aos 17%; não implementar antes da decisão DEC-FIN-01 sobre base, titularidade e finalidade.
5. Ledger interno é a fonte auditável dos direitos e obrigações; o saldo real disponível deve ser confirmado no provedor. Um não substitui o outro.
6. A data de elegibilidade é encerramento efetivo do evento + 72 horas em `America/Sao_Paulo`; persistir timestamp UTC e timezone de negócio. Não usar o instante do pagamento como início da retenção.
7. Nenhum repasse é concluído até haver confirmação verificável do provedor. Estados ambíguos ficam pendentes e passam por reconciliação.
8. Reembolsos, contestações e falhas geram lançamentos/estados auditáveis; não apagar o histórico financeiro original.

### 14. Modelo lógico proposto (não é schema implementado)

- `payment_transactions`: ID interno, referência de reserva/evento, ID externo do provedor, moeda, valor bruto em centavos, estado, timestamps e versão da regra.
- `financial_ledger_entries`: lançamentos imutáveis, tipo, valor em centavos, moeda, referência de origem, transação, casa, timestamps, chave idempotente e metadados mínimos de auditoria.
- `provider_fees`: valor efetivamente cobrado, estado de recuperação e vínculo com transação; contabilizado como despesa da plataforma.
- `refunds`: valor solicitado/confirmado, motivo categorizado, estado externo, timestamps e chave idempotente.
- `disputes`: identificador externo, valor afetado, estado, prazo, bloqueios e resolução.
- `payouts`: identificador interno/externo, destinatário validado, valor, estado, criado/enviado/confirmado e evidência do provedor.
- `event_settlements`: encerramento efetivo, timezone, timestamp de encerramento, instante de elegibilidade e estado de reconciliação.
- `reserve_movements`: alocações/movimentações da reserva de 2%, somente depois da decisão sobre base, finalidade e titularidade.
- `provider_webhook_events`: ID externo único, tipo, recebido/verificado/processado, payload minimizado, hash ou referência de evidência, tentativas e erro categorizado.

### 15. Máquina de estados e processamento

Separar no mínimo: estado de cobrança/pagamento; estado de reembolso; estado de contestação; estado de retenção/elegibilidade; estado de repasse. Não comprimir tudo em um único campo `status`.

Fluxo proposto:
1. Backend valida identidade, evento, preço e disponibilidade; cria referência e chave idempotente.
2. Backend cria cobrança no Sandbox por adaptador server-side; segredo não sai do servidor.
3. Evento do provedor é autenticado conforme documentação oficial; ID externo é persistido e deduplicado antes do processamento.
4. Backend reconcilia valor, moeda, referência e estado no provedor; só então confirma pagamento e lança parcelas no ledger.
5. Reserva o valor devido à casa e calcula elegibilidade com base no encerramento efetivo do evento + 72h.
6. Ao vencer o prazo, consulta reembolsos, contestações, saldo real e discrepâncias. Qualquer exceção bloqueia o valor afetado.
7. Cria uma ordem de repasse idempotente; timeout não é sucesso. Confirmação externa verificável encerra a ordem.
8. Reconciliação periódica compara ledger e provedor e gera alertas/itens para revisão humana.

### 16. Split, saldo, escrow, transferência e reembolso

Split é distribuição configurada no provedor; não comprova retenção por 72 horas após evento nem absorção de taxas. Saldo disponível é a informação de disponibilidade do provedor, não o direito contábil da casa. Transferência é movimento de fundos, com sucesso apenas após confirmação. Reembolso é uma operação separada e não garante que taxas sejam recuperadas ou que valores já transferidos sejam recolhidos. Escrow é uma estrutura específica e não pode ser afirmada sem comprovação contratual/regulatória.

Asaas permanece prioridade de avaliação. Antes de selecionar a arquitetura, verificar documentação oficial atual e Sandbox quanto a split sobre bruto, taxas, subcontas, saldo, bloqueio/retenção, transferência, reembolso integral/parcial, chargeback, autenticação de webhook, idempotência e reconciliação. Registrar fonte, data, teste e limitações. Se a retenção exigida não for suportada, suspender a implementação financeira e levar alternativa ao CTO.

### 17. Falhas, recuperação e segurança financeira

- Reembolsos integrais/parciais e solicitações durante retenção bloqueiam/ajustam o valor conforme estado confirmado e política versionada.
- Contestação pendente bloqueia o valor afetado até resolução.
- Após repasse, não presumir retirada automática; abrir fluxo auditável de recuperação e exigir base contratual/legal.
- Operações falhas, timeouts, eventos duplicados e estados desconhecidos devem ser idempotentes e reconciliáveis.
- Taxa não recuperada é registrada como despesa da plataforma, sem dedução automática dos 83% da casa.
- Saldo insuficiente gera exceção, alerta e revisão; não simular fundos ou marcar operação como concluída.
- Notificar a casa sobre pagamento, reembolso, contestação, bloqueio, ajuste e estado do repasse.
- Testes negativos devem provar que o cliente não pode manipular valor, casa, destinatário, estado, elegibilidade ou autorização.

### 18. Limites e aprovação

Esta seção é uma proposta arquitetural. Nenhum schema, API, webhook, ledger ou adaptador Asaas é declarado implementado. A implementação financeira requer execução específica, revisão do CTO, testes automatizados e Sandbox; produção permanece fora de escopo.

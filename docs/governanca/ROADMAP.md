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

## 3.2 Trilha futura — Central de Conexões e Studio da Casa

Esta trilha registra uma direção arquitetural aprovada para evolução futura. Não constitui ordem de execução, não altera a prioridade da trilha financeira e não autoriza conectar contas reais, contratar fornecedores ou iniciar desenvolvimento.

**Direção estrutural:** criar uma Central de Conexões transversal, consumida pelos módulos do Ilê Conecta. O Studio da Casa será um dos consumidores dessa infraestrutura, não seu proprietário. A Central deverá contemplar conectores de IA (por exemplo, OpenAI/GPT e Gemini), ferramentas criativas e de produtividade (por exemplo, Canva), ferramentas de desenvolvimento (por exemplo, Lovable e Replit) e serviços de armazenamento/código (por exemplo, Google Drive e GitHub), sempre limitados às APIs, permissões e operações oficialmente suportadas por cada fornecedor.

**Etapas futuras, sujeitas a priorização e ordens específicas:**

1. **Auditoria de reutilização:** inventariar autenticação, integrações, armazenamento, permissões, gestão de segredos, multi-tenancy, auditoria e componentes de interface já existentes. Identificar ownership e evitar duplicação.
2. **Matriz de conectores:** para cada fornecedor, documentar mecanismo oficial de conexão, escopos, operações suportadas, quotas, custos, restrições contratuais, revogação, webhooks e requisitos de segurança. Distinguir API, OAuth, importação/exportação e simples abertura de ferramenta.
3. **Fundação da Central:** especificar contratos de conectores, cadastro de conexões por organização/casa, autorização por módulo/operação, gestão segura de credenciais, isolamento, auditoria, desconexão e tratamento de falhas. Implementação depende de ordem aprovada.
4. **Piloto controlado:** selecionar um conector de IA e um conector criativo com operações oficialmente suportadas; validar conexão, permissões, fluxo de dados, custos, revogação e isolamento antes de ampliar o catálogo.
5. **Studio da Casa:** definir escopo funcional, experiência, integrações, dependências e critérios de qualidade; consumir a Central sem incorporar lógica própria de autenticação de cada fornecedor.
6. **Decisão de produto e negócio:** avaliar localização do Studio nos ambientes, público-alvo, planos, precificação, venda como vertical independente ou oferta combinada. Comparar custos e requisitos de identidade, billing, suporte, armazenamento, termos, marca e operação. Nenhuma dessas alternativas está escolhida neste Roadmap.

**Critérios mínimos antes de ampliar conectores:** evidência de API/integração oficial; permissões mínimas; isolamento entre casas; segredos protegidos no backend; revogação funcional; limites e custos transparentes; testes de falha e expiração; trilha de auditoria; ausência de fallback silencioso; e confirmação de que os dados enviados ao fornecedor são necessários e autorizados.

A lista de nomes é indicativa, não compromisso de disponibilidade. A integração com Canva, Lovable, Replit, Google AI Studio ou qualquer outro serviço só poderá ser especificada após verificar os mecanismos oficiais e capacidades concretas. Não prometer controle completo da interface de terceiros quando o fornecedor não oferecer essa capacidade.

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

### Registro: EXEC-01 — subsistema financeiro do Marketplace (Stripe)

Estado em 2026-11-10 (código em `main` pelo PR #141; migrations 0064–0066 aplicadas em produção; função `payments` ainda na v18, deploy pendente). Estados conforme a lista acima.

| Item | Estado | Evidência |
|---|---|---|
| Desacoplamento do provedor (contrato, adaptador Stripe, núcleo, banco) | testado | 271 testes unitários; E2E 105 verificações (Deno + supabase-js + PostgreSQL 16 reais, migrations 0001–0066) |
| Tarifa do processador sem falso zero (`fetchFees`) | testado | replay de 7 eventos reais (26 verificações) reproduz a causa do pagamento 435e e confirma a correção |
| Webhook: assinatura, idempotência, trava com dono, concorrência | testado | E2E: 12 entregas simultâneas, lease vencida, worker antigo não altera evento de outro |
| Checkout: sem segunda cobrança sem evidência; compare-and-set | testado | E2E: 6 checkouts simultâneos → 1 sessão; sessão paga → 409; corrida de gravação → 409 sem sobrescrever |
| Vínculo Checkout ↔ PaymentIntent ↔ Charge ↔ Pagamento ↔ Ledger | testado | migration 0066 (colunas, índices únicos, `record_provider_refs_for`); E2E M66 |
| Detecção de anomalias (`payments_provider_anomalies`) | testado | E2E M65/M66; consulta somente leitura em produção sinaliza apenas o pagamento 435e |
| `check_cron_secret` reproduzível | testado | migration 0065 (aplicada 2x em PostgreSQL local) |
| Integração real (Stripe real, assinatura real de webhook, Supabase Edge Runtime) | bloqueado | exige Supabase isolado e webhook de teste (custo/autorização do CTO) |
| Divergências históricas 435e e de60 | em auditoria | diagnóstico feito; nenhuma correção de dado sem autorização |

No banco de produção as migrations 0064–0066 estão aplicadas; a função `payments` implantada (versão 18) ainda é a anterior à EXEC-01 e é compatível com o esquema novo. Integração real (Stripe, webhook assinado) só passa a `testado` após o deploy e a compra de teste.

### Registro: Fase 1 — Auditoria das reconciliações do Blueprint §31.3

Estado em 2026-11-09 (auditoria somente leitura; nenhuma alteração em produção). Detalhe, evidências e achados F1–F12: `AUDITORIA_31_3_RECONCILIACOES.md`.

| # | Reconciliação | Estado | Achado principal |
|---|---|---|---|
| 1 | 17% × 15%/4% | testado | dados de produção só com 4% e regra v2; resíduos só em comentários antigos |
| 2 | Provedores antigos | evidência parcial | sem código ativo; resíduos dormentes no banco (0 linhas) |
| 3 | Integração × retenção | evidência parcial | cobrança direta sem retenção; caminho legado de repasse dormente |
| 4 | RLS e exposição pública | evidência parcial | F2 (P1): perfis e curtidas legíveis sem login |
| 5 | Convite e permissões da equipe | evidência parcial | F1 (P1): um convite aceito por várias pessoas ao mesmo tempo |
| 6 | Continuidade do handoff | evidência parcial | F4: sem estado de responsável; automação pode falar por cima do humano |
| 7 | Persistência e recuperação | evidência parcial | F5: dados de demonstração misturados aos reais |
| 8 | CRM unificado × disperso | lacuna | peças dispersas; timeline e pendências inexistentes (Fase 5) |
| 9 | Agenda, reserva e checkout | evidência parcial | F3 (P1): ritual não encerra 1 h antes; F7: ritual não ocupa a agenda |
| 10 | Migrations × Supabase | testado | schema = repo até 0063; registro com 18 de 66; 0064–0066 não aplicadas |

### Registro: EXEC-02 — correções F1, F2, F3, F7, F11 e F12 (2026-11-10)

Decisões do proprietário: F2 só casas públicas; F7 ritual ocupa a agenda com duração obrigatória; F10 ação dele no painel. Merge em `main` pelo PR #141 (junto com EXEC-01 e a auditoria). Migrations 0064–0068 aplicadas em produção pelo proprietário em 19 passos pequenos (`supabase/rollout/`), cada um conferido no banco por impressão digital das funções (33 funções idênticas ao ambiente de teste).

| Item | Estado | Evidência |
|---|---|---|
| F1 convite/limite de acessos | aplicado em produção (banco) | corrida 0/30; conferido no banco |
| F2 exposição de perfis e curtidas | aplicado em produção (banco), validado | leitura como visitante em produção: 3 perfis de casas, 0 de clientes, 0 curtidas |
| F3 janela de 1 h do ritual | aplicado em produção (banco e app) | sondagem + testes unitários |
| F7 ritual na agenda | aplicado em produção (banco e app) | sondagem (bloqueio, conflito, corrida); ritual existente sem duração não é afetado |
| F11, F12 | aplicado em produção (banco) | funções conferidas |
| 0068 anomalia de referências e `search_path` do gatilho | aplicado em produção | E2E 107/0 e mutação |

Regressão: 273 testes unitários, E2E 107/0, verify_0064 54/0, sondagem 164/0 (0067), build OK, tsc e lint sem erros. Mutação: remover cada correção faz o teste falhar.
Funções publicadas em 2026-11-10 pelo workflow `deploy-functions` (`payments` v19, `assistant-chat` v30, `verify_jwt` desligado como antes). Evidência de integração real (Stripe em modo de teste): a rotina agendada chamou a função nova (POST 200) e completou PaymentIntent e Charge dos 6 pagamentos antigos; o webhook de teste segue habilitado e apontando para a função.
**Correção das tarifas históricas (autorizada pelo proprietário em 2026-11-10):** 3 pagamentos confirmados tinham tarifa do processador 0 (falso zero da versão anterior): 435e (cartão R$ 200), 6cdf (cartão R$ 200) e 5974 (Pix R$ 300). Método: o proprietário rodou um único UPDATE marcando `processor_fee_cents` como nulo nessas 3 linhas; a rotina agendada (`reconcileFees`, código da v19) buscou a tarifa real no Stripe e gravou pelo caminho normal (`record_processor_fee_for`). Resultado verificado: 435e = 837, 6cdf = 837, 5974 = 357; cada um ganhou um novo lançamento `taxa_provedor` com o valor real e manteve o lançamento 0 antigo como histórico (sem apagar nada); bruto, comissão e repasse não mudaram (plataforma + casa = bruto). Depois disso, nenhum pagamento confirmado ou estornado tem tarifa 0 ou nula (8 no total).

**F6 — auditoria da equipe (0069, aplicada em produção em 2026-11-10):** decisões do proprietário: dono vê o histórico da própria casa; administração consulta para denúncias e disputas (motivo obrigatório, consulta registrada e invisível para a casa); retenção de 12 meses. Testes locais: sondagem 195/0 (31 verificações novas: cada ação gera 1 registro, leitura só do dono, imutabilidade, consulta da administração, retenção, apagar casa com equipe), 9 mutações detectadas, corrida de convites 0/30 e 0/30, migration idempotente e reversão testada (`supabase/rollback/0069_reversao.sql`), passos de produção 20–23 equivalentes à migration (impressão digital idêntica). Telas: "Histórico da equipe" na página Equipe e consulta no painel da administração. Estado: aplicada em produção pelo proprietário nos passos 20–23 (conferidos um a um por impressão digital: tabela, política, funções, gatilhos e cron `purge-staff-audit` idênticos ao ambiente de teste; 6 rotinas agendadas no total). Prova real em produção: convite criado e cancelado pelo dono geraram os registros `convite_criado` e `convite_cancelado` (papel dono, sem token), visíveis na página Equipe; a consulta da administração com motivo gerou `admin_consultou` (papel admin, com autor e motivo) e **não** aparece para a casa. Aceite, pausa, permissões e remoção ficaram cobertos pela sondagem local (31 verificações). Ajuste de texto: na visão da administração, as ações do dono aparecem como "O dono da casa".

**Incidente 2026-11-10:** o commit f8b6da5 (autor `onspace.ai`, publicado direto no `main` às 16:09) restaurou o `payments/index.ts` antigo e desfez correções F2 e F3 no app e na assistente; revertido pelo PR #151 (estado idêntico ao anterior, 273 testes, build ok). A função publicada no Supabase (v19) não foi afetada porque o deploy é manual. Ação do proprietário: revisar a integração do OnSpace com o repositório e proteger o `main` (exigir PR).

F5, F8 e F9 aplicados e verificados em produção (2026-11-10): F9 deixou 0 de 62 tabelas com TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para anon e authenticated, DML preservado, service_role intacto. F4 aplicada e verificada em produção (0071 passos 26–30; 0072 passo 31: a assistente volta a atender se a casa fica offline e parada; `assistant-chat` v38). Fase 1 da agenda única (0073, passos 32–35): agenda para qualquer serviço, serviço privado vendido só pela assistente, data do calendário com horário bloqueia 2 h; testada localmente, aguardando aplicação em produção. Pendências: reparo do registro de migrations do Supabase (19 entradas faltantes); F10 no painel e revogação dos tokens (ação do proprietário).

**Teste real de ponta a ponta (Stripe em modo de teste, 2026-11-10, serviço de R$ 1,00):**

| Cenário | Resultado verificado no banco |
|---|---|
| Cartão | pagamento confirmado 1x; PaymentIntent e Charge gravados; comissão 4; tarifa do processador 43 (fim do falso zero); ledger bruto 100 / plataforma 4 / casa 96 / tarifa 43; evento `checkout.session.completed` processado 1x |
| Reembolso (cancelar pedido) | pagamento estornado, pedido reembolsado, pedido de reembolso concluído; ledger estornado (−100/−4/−96); evento `charge.refunded` processado 1x |
| Retomada do pagamento + Pix | mesma sessão do Stripe reaproveitada; pagamento Pix confirmado, comissão 4, tarifa do processador 1, ledger correto, evento processado 1x |

Achados do teste, corrigidos e publicados: (a) PR #146 — o botão de contratar/reservar só libera depois de saber se a casa cobra pelo app (antes, um toque rápido criava pedido sem abrir o checkout e avisava a casa); (b) PR #147 — a confirmação de cancelamento informa o reembolso integral; (c) PR #148 — botão "Concluir pagamento" para o cliente (card do serviço, Minha atividade e vaga de ritual). Limite: a cobrança fica na conta de recebimento da casa e a conta da plataforma não a enxerga no Stripe; a prova do estorno vem do webhook assinado e do banco. Pendência de verificação em tela: confirmar no celular, após o deploy, que contratar abre o checkout no primeiro toque (a 3ª tentativa já abriu).


## 7. Declaração de governança

O Roadmap é o plano mestre de evolução. Não é uma lista para implementar tudo em sequência sem auditoria. A primeira obrigação é descobrir e validar o que já existe. Só então se autorizam correções específicas. O Blueprint permanece estável; o Roadmap registra ordem e estado.

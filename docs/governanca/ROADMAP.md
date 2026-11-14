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
4. Pagamentos: Stripe Connect, application fees, referências residuais de Asaas/Mercado Pago, webhooks, ledger e conciliação.
5. Regras de comissão históricas (17%) versus regras aprovadas (15%/4%).
6. Agenda, reserva temporária, checkout, concorrência, expiração e confirmação atrasada.
7. Assistente: controles independentes, modos, coleta de dados e handoff.
8. Equipe, convites, papéis e permissões.
9. CRM integrado e central de pendências.
10. Aceite dos Termos: persistência, prova de aceite, uma única solicitação pós-login e ausência de telas normativas recorrentes.
11. Cobrança de planos, adicionais, créditos e divulgação.
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
13. Casa contrata plano/adicional e capacidades são recalculadas corretamente.
14. Divulgação comprada é entregue e identificada como patrocinada.

Critério de saída:
- Cenários executados em ambiente controlado.
- Evidências de frontend, backend, banco e provedor quando aplicável.
- Casos de falha, repetição e concorrência cobertos.
- Nenhum estado crítico inferido de mensagem visual.

**Situação (2026-11-11): concluída na parte que depende só de engenharia.** Matriz e provas em `MATRIZ_JORNADAS_FASE3.md`.
- Testadas: jornadas 1 a 10 e 12 (banco real local, concorrência, repetição, permissão negada, mutações detectadas). Entregas da etapa: aceite único dos Termos e página "Termos e normas" (0076, passos 40–42); expiração automática das retenções com aviso à fila de espera (0077, passo 43, rotina a cada minuto); assistente com regra de assunto e acolhimento no luto; serviços agrupados por situação.
- Pendentes de decisão ou de fase: 11 (CRM, Fase 5), 13 (planos, depende de preços e limites), 14 (divulgação, depende de preços e posições) e o canal de suporte da jornada 10, que passou a ser a etapa Suporte (abaixo).
- Layout e navegação seguem para a etapa própria (Fase 6).

**Etapa Suporte (2026-11-11): em produção (banco, site e migrações 0078–0082, passos 44–59).**
- Entrada única "Relatar ocorrência" (clientes e casas): o chamado chega ao painel com fatos reais da plataforma; documentos e fotos só se a pessoa optar. Prioridade e prazo por tipo (risco de vida imediato; golpe, fraude, abuso, pagamento e reserva em 24 h; LGPD em 15 dias; dúvida e sugestão em 3 dias úteis). Limite de 5 chamados abertos por pessoa (risco de vida isento). Retenção: 12 meses, 24 com prova ou conflito.
- Painel admin "Suporte": fila, decisão registrada, mensagens reais de conversa em disputa mesmo se apagadas (acesso registrado), identidade retida de contas excluídas (5 anos).
- Conta: exportar dados, excluir conta (7 dias de reflexão e anonimização; registros de pagamento, reembolso e aceite mantidos), suspensão reversível, recuperação de senha, e-mail de suporte editável pelo painel (criado vazio).
- Assistente Conecta: só propõe chamado, a pessoa confirma; abre sozinha apenas em risco de vida; limite de 20 por hora e 80 por dia.
- Ao publicar: funções de borda `support-admin` e `conecta` (Action manual) e Redirect URL `/redefinir-senha` no Supabase Auth. Avaliação da Conecta com modelo real (`supabase/verify/eval_conecta.mjs`) ainda pendente de chave.
- Decisão do proprietário: Termos inalterados por ora. Texto de ciência (administrador vê mensagens apagadas durante um caso; identidade retida por 5 anos) exige nova versão dos Termos e novo aceite, e fica para depois.

### Fase 4 — Modelo comercial, financeiro e jurídico operacional

**Objetivo:** alinhar regra aprovada, implementação, contrato e fluxo real.

Entregas:
- Versionamento de taxas por transação.
- Reconciliação de comissões 15%/4%.
- Definição formal de tarifas do provedor, repasses, cancelamentos, reembolsos e disputas.
- Validação jurídica de intermediação, responsabilidade e termos da casa.
- Regras finais de planos, equipe, créditos IA e divulgação.
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
- **Etapa de layout e navegação (decisão do proprietário, 2026-11-11):** ajuste de layout, navegação, telas, subtelas e barra lateral das três visões (casa, cliente e administração) fica reunido nesta etapa, e não é feito em partes antes dela. Observações já levantadas para entrar nela: (a) pedidos recebidos da casa separados em "Em andamento" e "Histórico" (recolhido), mais novo primeiro; (b) etiqueta "Privado" no cartão do serviço é redundante com o bloco "Privados"; (c) serviços com nome e valor repetidos confundem cliente e assistente (avisar a casa ao cadastrar); (d) revisar a lista de itens e a ordem dos menus da barra lateral. (e) **painéis "ultra Premium" e profissionais (pedido do proprietário, 2026-11-12):** cada painel existente (casa, cliente e administração) deve ser reorganizado para uso no celular: hoje o módulo abre dezenas de informações em uma só tela e é preciso rolar por muitas opções até a desejada. Direção a avaliar: painéis com seções recolhíveis ou abas, resumo no topo, busca/atalhos para a opção desejada e um painel por tarefa. Os painéis novos criados antes disso (ex.: financeiro da administração) já nascem recolhidos e com abas internas, para não aumentar a rolagem. Já feito antes da etapa: lista de serviços da casa em blocos (ativos, privados, pausados) com o mais novo primeiro (#177).
- Testes de carga e capacidade.
- Experimentos de conversão sem comprometer transparência.

Critério de saída:
- Metas quantitativas definidas a partir de baseline.
- Testes de carga e monitoramento.
- Plano de rollback e resposta a incidentes.

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
- Provedor final e estrutura de liquidação/repasse.
- Política de cancelamento e reembolso validada juridicamente.
- Retenção de dados e prazos legais por categoria.
- Domínio próprio e provedor de e-mail (sugerido: Resend) para os avisos importantes: o proprietário registra o domínio no final; depois configuram-se SPF/DKIM e o envio.
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


### Registro: Fase 4 — andamento (atualizado em 2026-11-12)

Autorizada pelo proprietário em 2026-11-12. Cada item abaixo só passa a "fechado" depois de aplicado em produção pelo proprietário (passos pequenos, um por vez, conferidos no banco) e do código ir ao ar no merge do PR da etapa (branch `etapa/fase4-financeiro`). Nenhuma cobrança real foi ligada.

| # | Item | Estado | Evidência |
|---|---|---|---|
| 0 | Registro no Blueprint (§18.5, §19.4.1, §33.1) e preços 89,90 / 179,90 / 299,90 | fechado | migration 0083, passo 60 aplicado e conferido |
| 1 | Tabela de taxas versionada (15% rituais, 4% serviços e mensalidades) com histórico; pagamento novo grava a versão e a comissão vigentes; pagamentos antigos não são recalculados | fechado no banco (passos 61–62); tela no merge | migration 0084; verify_0084 e verify_rollout_60_62 |
| 2 | Matriz central de planos: limites, ferramentas e textos de cada plano num só lugar, editável no painel; banco, assistente e site leem dela; item ligado a ferramenta (vídeo de 30 s) aparece sozinho com "Novo" quando o interruptor é ligado | fechado no banco (passos 63–65); site e assistente no merge e na publicação da função `assistant-chat` | migration 0085; verify_0085 (equivalência antes/depois e ataques), verify_rollout_63; 370 testes |
| 3 | Painel financeiro da administração (resumo do período e conferência pagamentos × livro-razão × regra da época, 14 verificações); só administrador, cada consulta registrada | fechado no banco (passos 66–69); tela no merge | migration 0086; verify_0086 e verify_rollout_66; leitura nos dados reais de produção: 0 anomalias |
| 4 | Cobrança da plataforma às casas (Platform Billing): configuração, preços, dias úteis, faturas, tentativas de pagamento, tolerância de 3 dias úteis, suspensão parcial e total, cartão de fatura em atraso, avisos, painel da administração | fechado no banco (passos 70–98); telas e função `platform-billing` no merge e na publicação; cobrança real continua desligada até a ativação | migrations 0087 a 0090; verify_0087 a verify_0090; verify_rollout_70 a 92 |
| 5 | Créditos de IA (pacotes 80/200/500 a R$ 19,90 / 49,90 / 89,90, validade de 3 meses, reembolso proporcional em até 7 dias (ver linha 8); franquia do mês primeiro, depois os pacotes mais antigos; baixa única por resposta; avisos em 80%, 100% e ao acabar os créditos) | fechado no banco (passos 99–108); tela da casa e função `assistant-chat` no merge e na publicação | migration 0091; verify_0091 (74 verificações, inclui 6 respostas simultâneas com 3 créditos: exatamente 3 baixas); verify_rollout_99 |
| 7 | Cobrança automática no cartão salvo (decisões do proprietário, 2026-11-13): cobra no dia do vencimento; até 3 tentativas em dias seguidos (vencimento, +1, +2); depois segue o fluxo normal (tolerância, suspensão parcial, bloqueio total) com aviso na tela; avisos 3 dias e 1 dia antes dizendo o cartão final; a casa liga, desliga, troca e remove o cartão quando quiser; vale para mensalidade e vagas extras (nunca pacote de créditos) e só para faturas que vencem a partir da ativação | feito e publicado (modo teste): banco (passos 115–128, tudo conferido, permissões fechadas), função `platform-billing` com cadastro do cartão (Checkout em modo setup) e cobrança fora de sessão, card "Cobrança automática no cartão" em Planos (PRs #189 a #191). Teste real no Stripe (modo teste): R$ 5,00 cobrados no cartão final 4242, fatura baixada sozinha, receita e tarifa (R$ 0,59) no livro-razão, aviso enviado, sem cobrança dupla. Pendente: teste de recusa e de cartão que pede confirmação do banco; texto da autorização nos Termos (decisão do proprietário, com o advogado); ao excluir uma conta, apagar o cartão e o cliente no provedor | migration 0094; verify_0094 (94 verificações); verify_rollout_115; tests/platform-billing-auto.test.mjs |
| 8 | Reembolso de créditos em até 7 dias (decisões do proprietário, 2026-11-13, orientação do advogado): pacote sem uso devolve integral; com uso devolve o valor proporcional às respostas restantes (valor pago × restantes ÷ total, meio centavo para cima); franquia do mês gasta primeiro; a plataforma absorve a tarifa do Stripe; estorno pelo mesmo meio de pagamento; saldo retirado ao pedir e devolvido se o provedor recusar; rotina refaz pedidos sem resposta com a mesma chave | fechado: banco (passos 129–139), função `platform-billing` publicada, tela da casa e merge | migration 0095; verify_0095 (55 verificações); 10 testes do reembolso. Teste real em Stripe de teste na casa Gezebel (Pix): integral R$ 19,90 de 80 de 80 respostas e parcial R$ 12,44 de 50 de 80 respostas, ambos `succeeded` no Stripe, ledger com estorno e saldo do pacote zerado. Pendências: textos dos Termos; Blueprint e Roadmap atualizados |
| 9 | Termos sem trava e aceite nos momentos de dinheiro (decisões do proprietário e do advogado, 2026-11-13): mudança de Termos avisa por notificação com registro de leitura, sem bloquear a tela; autorização do cartão com caixa e texto registrados (o servidor exige); frase junto ao botão de pagar com registro por compra; caminho de reembolso em "Pedidos e validações" | feito e publicado (modo teste): banco (passos 140–146), função e telas | migrations 0096 e 0097; verify_0096 (39) e verify_0097 (21); verify_rollout_140 e 144 |
| 10 | Reembolso do primeiro pagamento do plano em até 7 dias (uma vez por casa; integral; casa inativa pelo bloqueio total, dados mantidos; cobrança mensal e cartão automático encerrados; se o provedor recusar, nada muda) | feito e publicado: banco (passos 147–158), função `platform-billing` (ação `plan_refund` e rotina), tela em Pedidos e validações. Teste real no Stripe (modo teste) na Gezebel: R$ 299,90 estornados (`succeeded`), fatura estornada, ledger com estorno, casa inativa, depois reativada | migration 0098; verify_0098 (69 verificações); verify_rollout_147; tests/platform-billing-refund.test.mjs |
| 11 | Reativação da casa inativa: a casa escolhe o plano e paga (volta sozinha e é matriculada de novo, sem novo reembolso de 7 dias) ou o suporte reativa no painel | feito e publicado: banco (passos 159–164), função (ação `reactivate`), card em Planos. Teste real no Stripe (modo teste) na Gezebel1 com Pix: R$ 299,90, casa de volta ao normal, matriculada no dia 13, aviso enviado uma vez. Cobrança automática nunca puxa fatura de reativação esquecida | migration 0099; verify_0099 (44 verificações); verify_rollout_159; tests/platform-billing-reactivate.test.mjs |
| 12 | Atualização da tabela comercial (reajuste) com aviso de 30 dias: o administrador anuncia, a vigência é no mínimo 30 dias depois, cada casa muda na sua primeira renovação a partir da vigência e é avisada da data da própria renovação; aumento direto na tabela é recusado com a cobrança ligada; redução vale na hora | feito e publicado (passos 165–174; sem reajuste anunciado ainda). Pendente de decisão do proprietário: aviso por e-mail (os Termos prometem; não existe envio de e-mail) e caminho de cancelamento sem multa antes da renovação | migration 0100; verify_0100 (57 verificações); verify_rollout_165 |
| 13 | Cancelamento da assinatura pela casa ("usar até o vencimento" ou "cancelar agora", com desfazer; recusa com fatura em atraso) e tela única "Conta bloqueada" / "Conta inativa" (fluxos separados; suporte, baixar meus dados e Termos abertos; equipe só avisada); trava de gravação no servidor para casa em bloqueio total (13 tabelas, 39 travas) | feito e publicado (modo teste): banco (passos 175–180), telas e testes. Testado de ponta a ponta pelo proprietário em modo teste (cancelar, conta inativa, reativar por Pix e cartão, conta bloqueada, desbloquear por Pix). Corrigido no teste: reativação no mesmo dia (migration 0102, passo 181). Pagamento recusado, com 3DS e cobrança automática recusada validados. Pendente: e-mail de avisos importantes (decisão do proprietário: só avisos de conta, junto com a notificação; provedor sugerido: Resend; depende de domínio próprio, que o proprietário registra no final) | migration 0101; verify_0101 (75 verificações); verify_rollout_175; tests/account-gate.test.mjs; 473 testes |
| 14 | Cancelar com fatura vencida (a dívida continua aberta e a conta inativa só reativa depois de quitar), confirmação extra em "Cancelar agora" e cobrança automática só com aceite registrado (cartões antigos sem aceite têm a cobrança automática desligada e a casa é avisada). Base jurídica: parecer do advogado de 13/11/2026 | feito e publicado (passos 182–186, PR #204/#205), modo teste. Validado pelo proprietário na casa Gezebel1: cancelar com fatura vencida, tela de conta inativa com a dívida, pagar por Pix e reativar. Pendentes: texto final dos Termos (advogado; [X].5 sem negativação enquanto não houver CPF/CNPJ), aviso automático de 30 dias para mudar o prazo de bloqueio total, aviso por e-mail (no final, com domínio) | migration 0103; verify_0103 (28 verificações); verify_rollout_182; tests/account-gate.test.mjs |
| 15 | Casa em bloqueio total ou inativa sai da vitrine (descoberta, busca e feed) e ninguém inicia nada novo com ela; cliente com pedido em andamento só conclui (opção A, decisão do proprietário). Divergência achada ao conferir a minuta dos Termos: Blueprint e telas diziam "fora da vitrine", mas o banco não escondia nada | feito e publicado (passos 187–189, PR #206). Em produção: 6 políticas de leitura e 5 travas; visitante sem login não vê casa bloqueada/inativa | migration 0104; verify_0104 (37 verificações); verify_rollout_187 |
| 16 | Exclusão de conta não passa por cima de pendência financeira (orientação do advogado de 13/11/2026: a LGPD permite bloquear o encerramento por pendência financeira; a tela diz os motivos e a trava não gera cobrança). Bloqueiam: fatura vencida da plataforma (com o valor), assinatura ativa, pagamento em processamento e reembolso do plano em andamento, além das travas antigas. Ao anonimizar, o cartão guardado é apagado do banco e entra numa fila para o Stripe desvincular o cartão e apagar o cliente (falha repete); o registro de autorização da cobrança automática é mantido (retenção de 5 anos) | feito e publicado (passos 190–192, função support-admin v7, PR #207), modo teste. Testado de ponta a ponta em 14/11/2026 na casa Gezebel1: tela barra com assinatura ativa, cancelar, pedir exclusão, rotina executou, cartão desvinculado e cliente apagado no Stripe (modo teste), fila vazia, autorização mantida | migration 0105; verify_0105 (33 verificações); verify_rollout_190; tests/support-admin.test.mjs |
| 17 | Conta reutilizada (decisão do proprietário, opção B): quem volta com o e-mail de uma conta excluída é marcado, sem ser impedido. Compara o e-mail normalizado (sem +apelido, sem pontos no gmail) com a identidade já retida por 5 anos (nenhum dado novo guardado). O reembolso de 7 dias só é negado quando uma conta anterior do mesmo e-mail já o usou (parecer do advogado: negar a quem nunca usou viola o art. 49 do CDC). Painel do administrador: lista com selo, histórico retido (motivo obrigatório, registrado) e aviso com texto-modelo neutro. Correção achada no teste: o endereço da casa encerrada usava só 8 caracteres do id e uma colisão travaria a exclusão; agora usa o id inteiro | feito e publicado (passos 193–197, PR #209 e aviso na página de planos), modo teste. Validado pelo proprietário em 14/11/2026: casa Gezebel1 excluída e recriada com o mesmo e-mail aparece no painel como "Voltou após exclusão" e vê o aviso "Conta reutilizada". Advogado respondeu em 14/11/2026 (base legal ok; ajuste do reembolso; textos dos Termos e da Política de Privacidade). Ajuste do reembolso: migration 0107 publicada em 14/11/2026 (passos 198–199 rodados pelo proprietário, funções e permissões conferidas no banco, PR #215 em produção). Textos do advogado aplicados nos Termos e na Política de Privacidade em 14/11/2026 | migrations 0106 e 0107; verify_0106 e verify_0107 (37 verificações cada); verify_rollout_193 e verify_rollout_198 |
| 18 | Contratação de plano dentro do app: primeira assinatura (vence no dia do pagamento), upgrade com diferença proporcional (vencimento não muda) e descida/volta ao Base na renovação, sem devolução. Faturas de assinatura/upgrade nunca viram atraso, não recebem lembrete e não são puxadas pelo cartão automático. Tela de Planos com valor mostrado antes de pagar | em validação local (59 verificações no banco, 7 testes do servidor); aguardando passos 200–207 em produção e o merge | migration 0108; verify_0108 (59 verificações); verify_rollout_200; tests/platform-billing-planchange.test.mjs |
| 6 | Alinhamento da página de planos: textos sem o nome de teste "Lara" (a casa dá o nome da assistente) e foto opcional da assistente, só em plano com assistente | fechado no banco (passos 109–112); telas no merge | migration 0092; verify_0092 (35 verificações); verify_rollout_109; 413 testes |

Ideias futuras registradas (não fazem parte da Fase 4; só entram com decisão do proprietário):

- **Plano anual por plano (proposta do proprietário, 2026-11-12):** 12 meses de uso pagando 10 (2 meses grátis). Fazer depois que a cobrança mensal estiver ligada e medida. Antes de fixar o preço: conferir o custo real de IA por casa no plano Max contra 83% da receita mensal. Decisões do proprietário pendentes: política de cancelamento e reembolso no meio do ano (recomendação: proporcional ao preço mensal cheio, depois dos 7 dias do CDC, com validação jurídica), valores finais, redação nos Termos (preço contratado vale até o fim dos 12 meses). Pontos técnicos: o motor hoje tem uma fatura por mês e precisa de período anual, aviso antes da renovação e a mesma tolerância e suspensão; upgrade cobra só a diferença proporcional e downgrade só vale na renovação; o Max anual (R$ 2.999,00) fica no limite do teto do Pix do Stripe (cerca de US$ 3.000), então cartão como padrão, e é preciso confirmar na documentação do Stripe o parcelamento em reais; preços anuais editáveis no painel.
- **Compensação de fatura em atraso contra repasses:** o proprietário decidiu NÃO implementar (o dinheiro não passa pela plataforma: cobrança direta no Stripe Connect). Só reavaliar com validação do Stripe e jurídica.
- **Card da fatura em lugar estratégico (pedido do proprietário, 2026-11-12):** hoje o card "Faturas da plataforma" fica em Planos, no meio de várias outras opções, e a casa precisa procurá-lo. Reposicionar para um lugar de destaque junto com o resto do layout e navegação (Fase 6). A função de pagar em fatura aberta já existe (botões Pix e cartão na lista de faturas).
- **Desconto de pontualidade no Pix (proposta aceita pelo proprietário em princípio, 2026-11-12):** com 7 ou 10 dias antes do vencimento a casa recebe o aviso "Sua fatura está disponível, pague com Pix e ganhe 5% de desconto". Só na mensalidade do plano (não vale para créditos nem vagas extras). Percentual, dias de antecedência, prazo do desconto e liga/desliga editáveis no painel; depois do prazo a fatura volta ao valor cheio (sem multa nem juros). Decisões do proprietário pendentes: percentual final, 7 ou 10 dias, e se vale só para Pix (recomendado: a tarifa do Pix foi cerca de 1,2% e a do cartão cerca de 4,1% nos testes). Casas no cartão recorrente não recebem a mensagem do desconto (evita sensação de injustiça); benefício próprio para o cartão recorrente é opção futura, a decidir. Antes de fixar o percentual, conferir o custo real de IA de uma casa Premium ativa. Texto nos Termos como "desconto para pagamento antecipado via Pix", com confirmação jurídica (Lei 13.455/2017 permite preço diferente por meio de pagamento, desde que informado com clareza). Pontos técnicos: a fatura guarda valor cheio, valor com desconto e prazo; a página de pagamento cobra o valor certo pela data; a confirmação aceita os dois valores e rejeita qualquer outro.

Pedido do proprietário registrado nesta data: painéis das três visões enxutos e profissionais no celular — vai para a etapa de layout e navegação (Fase 6); os painéis novos já nascem recolhidos.

## 7. Declaração de governança

O Roadmap é o plano mestre de evolução. Não é uma lista para implementar tudo em sequência sem auditoria. A primeira obrigação é descobrir e validar o que já existe. Só então se autorizam correções específicas. O Blueprint permanece estável; o Roadmap registra ordem e estado.

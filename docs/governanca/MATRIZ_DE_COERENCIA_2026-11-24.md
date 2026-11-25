# Matriz de coerência (documentos × código × banco) — 24/11/2026

Status: **subordinada ao Blueprint**. Registra o que foi conferido na auditoria da etapa 145, o que o código e o banco fazem de fato, quem decidiu e o que foi feito. Hierarquia de autoridade quando houver conflito: **decisão datada do proprietário > Blueprint > Roadmap > documentos subordinados**. Documento antigo que perde ganha a marca "SUPERADO por … em …".

Vocabulário de estado de cada entrega: **Decidido → Construído → Implantado → Ligado → Validado ao vivo**.

## 1. Divergências encontradas e resolvidas

| # | Tema | Fontes que divergiam | O que o código/banco faz de fato | Decisão (quem, quando) | Ação | Estado |
|---|---|---|---|---|---|---|
| 1.1 | Comissão nos planos pagos | Blueprint §18.1 ("nos pagos não há taxa") × §19.1 (15% e 4%) | `fee_cents` (0084) cobra 15%/4% sem olhar o plano; produção: 3 pagamentos, todos 4% (regra v2-2026-10) | Proprietário, 24/11: vale em todos os planos | Blueprint §18.1 e §33.1 corrigidos; teste `docs-coerencia` | Implantado e coerente |
| 1.1b | Venda desligada | Blueprint ("a venda pela página continua") × fala do proprietário ("não vendemos mais pela plataforma") | `assistants.can_sell` só desliga a venda pela assistente; a página continua vendendo e cobrando | Proprietário, 24/11: **NÃO**, o botão da página fica; só a assistente deixa de vender | Blueprint §18.1 e §33.1 | Decidido e coerente |
| 1.2 | Franquia de IA | Blueprint §18.3 (300/3.000), §18.1 (1.700), código | Matriz em produção: 100/500/1.700/3.400 (conferida no banco) | Proprietário, 24/11: 100/500/1.700/3.400 | Blueprint §18.3, regras por recurso e regras financeiras corrigidos; teste | Implantado e coerente |
| 1.3 | Provedor de cobrança | Contratos (Efí) × Blueprint (Stripe) | Só Stripe existe | Proprietário (13/11 e 20/11) | Contratos marcados "SUPERADO no provedor" | Coerente |
| 1.4 | Re-aceite dos Termos | Política de aceite §5 e §10, regras por recurso, Blueprint, código | O código NÃO pedia de novo (mínimo fixo na versão 1) | Proprietário 24/11 ("reaparece"), **substituído em 25/11 pelo modelo do advogado**: aviso na Home, aceite só na próxima compra, venda ou assinatura, sem bloqueio | `DOC_MIN_VERSION`, banner, aceite nas três ações, migração 0224, política, Blueprint, testes | Construído na etapa 146 |
| 1.5 | "Vídeo no ritual" do Premium | Blueprint ("vídeo no ritual") × "vídeo só no Plus" | `ritual_video` é o vídeo de 30 s dos registros, não a videochamada | — | Texto do Blueprint esclarecido | Coerente |
| 1.6 | Roadmap 143 | "função precisa de deploy" × função já publicada | `video` v15 ativa em produção | — | Linha corrigida; teste proíbe a frase | Implantado; validação ao vivo pendente |
| 1.7 | Blueprint sem vídeo, pedido de membro e visitas | Roadmap 127–144 × Blueprint | Tudo implantado | — | §33.1 (24/11) registra cada um | Coerente |
| 1.8 | Mapa técnico de 17/11 | Números e funções antigos | 150 tabelas (todas com RLS), 38 rotinas, funções `video`, `account-recovery`, `send-email` | — | Mapa atualizado | Coerente |

## 2. Segurança conferida em produção

| Item | Achado | Ação | Estado |
|---|---|---|---|
| Permissão de escrita do papel anônimo | 40 tabelas com insert/update/delete concedidos (RLS bloqueava) | 0221 retira; novas tabelas nascem sem | Implantado e verificado (0 tabelas) |
| `legal_consents` | escrita concedida ao logado | 0221 retira; só `record_consent` grava | Implantado e verificado |
| Avisos do Supabase | 2 funções sem search_path fixo | 0220 | Implantado e verificado |
| Avisos restantes | funções liberadas ao logado/anônimo (são as chamadas do app; cada uma confere a pessoa); 80 tabelas com RLS sem política (acesso só por função, de propósito); senhas vazadas desativado | — | Senhas vazadas: **futuro** (pós-lançamento; painel, plano Pro) |
| Funções exclusivas do servidor do vídeo, lembrete, remoção, sinais | `video_removed_check`, `video_cron_ok`, `video_send_reminders`, `member_req_*`, `house_signals_on` sem permissão para anônimo e logado | — | Verificado |
| Tabelas novas (vídeo, convites, remoção, pedidos, sinais) | RLS ligada e nenhuma permissão direta ao logado | — | Verificado |
| Funções de teste antigas | `stripe-check` e `asaas-sandbox-check` respondem 410 | Apagar no painel | **Futuro** (pós-lançamento; inertes) |

## 3. Aceite também no servidor (decidido e feito)

Decisão do proprietário: texto que muda exige novo aceite; texto que não mudou, um único aceite. O servidor passou a conferir a versão mínima na compra do cliente e na venda da casa (migração 0222, tabela `legal_min_version`; a 0223 sobe o mínimo para a versão 23 junto com o app). Teste `legal-servidor` garante que o mínimo do servidor é igual ao do app.

## 3b. Banco de produção × migrações (conferido por inteiro)

PostgreSQL 16 local com as 220 migrações aplicadas e a impressão digital de `supabase/verify/audit/fingerprint.sql` comparada com a de produção: 150 tabelas (colunas e tipos), 142 políticas e 112 gatilhos idênticos; funções: as 658 de produção existem no repositório com o mesmo código (diferenças só de comentário SQL e de parênteses redundantes em `admin_recovery_get`, mesmo resultado). Nenhuma deriva real.

## 4. Estado das entregas recentes

| Roadmap | Entrega | Estado |
|---|---|---|
| 139–141 | Aceite por reunião, convidados, cartão e lembrete | Implantado; reunião com 3 ou mais pessoas: citada pelo proprietário como já feita (confirmar) |
| 142 | Pedido e convite de membro | Implantado e ligado; **validado ao vivo** pelo proprietário (celular, casa e cliente) |
| 143 | Chat na sala e remoção | Implantado (função `video` v15); validação ao vivo da remoção pendente do proprietário |
| 144 | Visitas, alcance e intenções | Implantado; **desligado** (`features.house_signals`) |
| 145 | Esta auditoria | Construído; entra com o PR #398 |

## 5. Como não voltar a divergir

Testes que falham quando os números se afastam: `tests/legal-servidor.test.mjs` (mínimo do servidor = do app), `tests/docs-coerencia.test.mjs` (franquias, comissão, migrações no Roadmap, frases antigas) e `tests/legal-hash.test.mjs` (texto jurídico só muda com decisão registrada).

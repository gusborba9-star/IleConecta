# Matriz de coerência (documentos × código × banco) — 24/11/2026

Status: **subordinada ao Blueprint**. Registra o que foi conferido na auditoria da etapa 145, o que o código e o banco fazem de fato, quem decidiu e o que foi feito. Hierarquia de autoridade quando houver conflito: **decisão datada do proprietário > Blueprint > Roadmap > documentos subordinados**. Documento antigo que perde ganha a marca "SUPERADO por … em …".

Vocabulário de estado de cada entrega: **Decidido → Construído → Implantado → Ligado → Validado ao vivo**.

## 1. Divergências encontradas e resolvidas

| # | Tema | Fontes que divergiam | O que o código/banco faz de fato | Decisão (quem, quando) | Ação | Estado |
|---|---|---|---|---|---|---|
| 1.1 | Comissão nos planos pagos | Blueprint §18.1 ("nos pagos não há taxa") × §19.1 (15% e 4%) | `fee_cents` (0084) cobra 15%/4% sem olhar o plano; produção: 3 pagamentos, todos 4% (regra v2-2026-10) | Proprietário, 24/11: vale em todos os planos | Blueprint §18.1 e §33.1 corrigidos; teste `docs-coerencia` | Implantado e coerente |
| 1.1b | Venda desligada | Blueprint ("a venda pela página continua") × fala do proprietário ("não vendemos mais pela plataforma") | `assistants.can_sell` só desliga a venda pela assistente; a página continua vendendo e cobrando | **Pendente do proprietário** | Registrado no Blueprint e no Roadmap 145 | Aberto (decisão) |
| 1.2 | Franquia de IA | Blueprint §18.3 (300/3.000), §18.1 (1.700), código | Matriz em produção: 100/500/1.700/3.400 (conferida no banco) | Proprietário, 24/11: 100/500/1.700/3.400 | Blueprint §18.3, regras por recurso e regras financeiras corrigidos; teste | Implantado e coerente |
| 1.3 | Provedor de cobrança | Contratos (Efí) × Blueprint (Stripe) | Só Stripe existe | Proprietário (13/11 e 20/11) | Contratos marcados "SUPERADO no provedor" | Coerente |
| 1.4 | Re-aceite dos Termos | Política de aceite §5 e §10, regras por recurso, Blueprint, código | O código NÃO pedia de novo (mínimo fixo na versão 1) | Proprietário, 24/11: reaparece quando o texto muda | `DOC_MIN_VERSION`, política reescrita, Blueprint, testes (unidade, impressão digital e UI) | Construído; entra com este PR |
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
| Avisos restantes | funções liberadas ao logado/anônimo (são as chamadas do app; cada uma confere a pessoa); 80 tabelas com RLS sem política (acesso só por função, de propósito); senhas vazadas desativado | — | Senhas vazadas: **pendente do proprietário** (painel, plano Pro) |
| Funções exclusivas do servidor do vídeo, lembrete, remoção, sinais | `video_removed_check`, `video_cron_ok`, `video_send_reminders`, `member_req_*`, `house_signals_on` sem permissão para anônimo e logado | — | Verificado |
| Tabelas novas (vídeo, convites, remoção, pedidos, sinais) | RLS ligada e nenhuma permissão direta ao logado | — | Verificado |
| Funções de teste antigas | `stripe-check` e `asaas-sandbox-check` respondem 410 | Apagar no painel | **Pendente do proprietário** (inertes) |

## 3. Recomendação não implementada (decisão de arquitetura)

Exigir também no servidor a versão mínima do aceite. Hoje a trava de re-aceite é da tela; as compras conferem se existe aceite do documento, não a versão. Risco baixo (o aceite explícito por compra continua registrado com versão), mas fecha a lacuna por completo. Aguarda o proprietário.

## 4. Estado das entregas recentes

| Roadmap | Entrega | Estado |
|---|---|---|
| 139–141 | Aceite por reunião, convidados, cartão e lembrete | Implantado; validação ao vivo com 3+ pessoas pendente |
| 142 | Pedido e convite de membro | Implantado e ligado; validação ao vivo pendente |
| 143 | Chat na sala e remoção | Implantado (função `video` v15); validação ao vivo pendente |
| 144 | Visitas, alcance e intenções | Implantado; **desligado** (`features.house_signals`) |
| 145 | Esta auditoria | Construído; entra com o PR #398 |

## 5. Como não voltar a divergir

Testes que falham quando os números se afastam: `tests/docs-coerencia.test.mjs` (franquias, comissão, migrações no Roadmap, frases antigas) e `tests/legal-hash.test.mjs` (texto jurídico só muda com decisão registrada).

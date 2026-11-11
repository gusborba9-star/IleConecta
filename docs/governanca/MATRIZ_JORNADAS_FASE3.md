# Fase 3 — Matriz das 14 jornadas centrais

Criada em 2026-11-11 (início da etapa). Estados: **testada** (prova automatizada reproduzível), **parcial** (parte provada, parte não), **lacuna** (sem prova ou sem implementação), **decisão** (depende de decisão do proprietário, não será inventada). A coluna "Próximo passo" é o plano da etapa; ao final dela esta matriz é atualizada com o resultado.

Provas que existem hoje: testes unitários (`npm test`, 301), E2E de pagamentos com Deno + PostgreSQL 16 reais e Stripe simulado (`supabase/verify/e2e/run_e2e.mjs`, 130 verificações), E2E da assistente (30), sondagem de permissões por papel (`supabase/verify/audit/probe_rls_equipe_reservas.mjs`, 195), verificações das migrations 0071 a 0075, Playwright de telas (`tests/e2e/flows.spec.mjs`, modo demonstração, sem banco real). Teste manual real do proprietário com Stripe em modo de teste (serviço de R$ 1,00: cartão, reembolso e Pix).

| # | Jornada | Estado | Evidência | Lacuna / próximo passo |
|---|---|---|---|---|
| 1 | Visitante descobre casa e oferta pública | parcial | Sondagem: visitante lê só casas públicas (3 perfis de casas, 0 de clientes, 0 curtidas em produção); página pública da casa existe | Sem teste que percorra a página pública com dados reais (serviços ativos, privados escondidos, rituais). Testar: privado nunca aparece ao visitante |
| 2 | Autenticação e aceite único dos Termos | parcial | Textos e versão testados (`legal-core`). O banco exige o aceite do cliente antes de pagar (`has_client_terms`, migrations 0026 e 0067). O aceite marcado no cadastro fica guardado no navegador e é gravado na primeira entrada | Divergência com `POLITICA_ACEITE_TERMOS.md`: a política pede uma etapa pós-login que consulta o backend e bloqueia até aceitar; hoje não existe essa etapa. Se o aceite do cadastro se perder (outro aparelho, navegador diferente na confirmação do e-mail), a pessoa só é cobrada do aceite na primeira compra. Decisão de fluxo a levar ao proprietário (bloqueia o app até aceitar, inclusive contas existentes e colaboradores) |
| 3 | Cliente inicia conversa e o handoff preserva contexto | testada | 0071 a 0075 verificadas; 29 verificações de handoff; E2E da assistente; histórico da casa entra marcado e a assistente retoma | Teste de ponta a ponta: casa responde, sai, assistente volta com o contexto |
| 4 | Assistente completa a venda quando autorizada | testada | Venda real do proprietário (serviço privado, horários reais, botão de pagamento no chat); testes de prompt e de catálogo; `service_purchasable` | Teste automatizado do caminho inteiro (oferta, prova de oferta, agenda, pedido) no banco real local |
| 5 | Assistente encaminha a intenção quando a venda está desativada | testada | Regra "casa fecha pessoalmente" no prompt; testes de ofertas | Teste de que o botão de contratar não é indicado nesse modo |
| 6 | Contrata serviço com horário e a agenda bloqueia sem conflito | parcial | `available_slots`, bloqueios do calendário (0073), verificação 0073, sondagem de reservas | Corrida: dois clientes pegam o mesmo horário ao mesmo tempo (um só vence). Conflito serviço × ritual × bloqueio manual |
| 7 | Cliente compra ritual coletivo pelo fluxo interno | parcial | E2E de pagamentos (reserva confirmada, ledger); regras do ritual testadas | Sem teste da tela. Fila de espera e ritual esgotado ainda sem prova de ponta a ponta |
| 8 | Reserva temporária expira e libera capacidade | testada | Sondagem: reserva vencida vira expirada e o pagamento pendente vira falhou | Conferir a rotina agendada que expira (cron) em ambiente de teste e a vaga voltando para a fila |
| 9 | Webhook confirma pagamento, inclusive duplicado e atrasado | testada | E2E: duplicado, assinatura inválida, replay, concorrência (12 entregas), sessão expirada, Pix processando, falha de rede | Nenhuma nova |
| 10 | Cliente acompanha pedido, pagamento e pede suporte | parcial | Minha atividade, "Concluir pagamento", cancelamento e reembolso testados | O suporte é só página institucional (sem pedido de suporte ou protocolo). Solicitação de reembolso existe. Decidir se suporte vira fluxo próprio (Fase 5) |
| 11 | Casa acompanha a pessoa no CRM sem duplicação | lacuna | Peças dispersas (conversas, pedidos, agenda) | Timeline e pendências só na Fase 5; nesta etapa só garantir que nenhuma cópia paralela seja criada |
| 12 | Titular convida colaborador e concede só o autorizado | parcial | Sondagem por papel; corrida de convites 0/30; auditoria da equipe (0069) | Sem teste de tela. Testar permissões negadas e convite expirado, cancelado e reaproveitado |
| 13 | Casa contrata plano/adicional e as capacidades recalculam | decisão | Plano hoje é alterado pelo painel de administração (0033); botão "Planos" leva ao suporte | Sem compra pela plataforma. Depende da matriz de limites por plano e dos preços (pendência do roadmap §5) |
| 14 | Divulgação comprada é entregue e marcada como patrocinada | decisão | Impulsionar e Destaques ficam desativados em produção ("Contratação disponível em breve"); só simulação local | Sem cobrança nem entrega. Depende de preços e posições (pendência do roadmap §5). Garantir que nada pareça contratado sem estar |

## Plano da etapa

1. Fechar as jornadas **parciais** e **testadas com ressalva** (1, 2, 3, 4, 5, 6, 7, 8, 10, 12) com testes novos, tentando quebrar cada uma (concorrência, repetição, permissão negada, dado de outra casa).
2. Corrigir o que os testes expuserem (inclusive o que já existia).
3. Jornadas 11, 13 e 14 não são implementadas nesta etapa: dependem de decisão do proprietário ou da Fase 5. A etapa garante que o estado atual não prometa o que não existe.
4. Ao final: regressão completa, lista de passos de banco e de funções, deploy do app e atualização do roadmap.

# Política de retenção e exclusão de conta (validada pelo advogado em 17/11/2026)

Decisão do proprietário; **um advogado deve confirmar prazos e base legal antes da publicação nos Termos/Privacidade**.

## Exclusão de conta
- Prazo de reflexão de 7 dias; a pessoa pode cancelar. Administrador pode recusar ou antecipar (com motivo registrado).
- Bloqueios: pagamento/reembolso em andamento, rituais futuros com reserva confirmada (casas), **chamado de disputa em análise**.
- Anonimização (nunca apagar linhas com vínculo financeiro): perfil vira "Conta excluída"; textos de mensagens, respostas de reservas, observações de pedidos e motivos de reembolso são removidos; avisos, seguidores e arquivos pessoais são apagados; casas viram "Casa encerrada".

## O que fica guardado
| Dado | Prazo | Quem acessa |
|---|---|---|
| Pagamentos, reembolsos, livro-caixa, aceites dos Termos (sem textos livres) | 5 anos | Administrador |
| **Identidade retida** (nome do perfil, e-mail, tipo de conta, nomes das casas) para identificar o autor de aceites/transações | 5 anos, depois nome e e-mail são apagados | Somente administrador; cada consulta exige motivo e fica registrada |
| Chamados e denúncias, com as mensagens | **24 meses após o encerramento**, para todos (resposta do advogado, 17/11/2026; migration 0151) | Administrador; partes veem só o seu lado |
| Mensagens apagadas pelo autor (texto original) | 30 dias; **24 meses enquanto houver chamado aberto sobre a conversa** | Somente administrador, em caso de conflito |

## Observações
- O nome do perfil **não é identidade civil verificada**; a plataforma não coleta CPF/nome legal. A identidade de pagamento fica no Stripe.
- Os Termos e a tela de abertura de chamado devem informar: o painel vê as últimas 30 mensagens da conversa (inclusive apagadas) e dados do pedido.

## Tabela completa validada pelo advogado (17/11/2026) e como o sistema cumpre cada prazo
| Dado | Prazo | Como o sistema cumpre |
|---|---|---|
| Registros de acesso (IP, data e hora) | 6 meses (Marco Civil, art. 15) | `access_logs` (0152): conta, IP, data e hora ao abrir o app conectado; só o servidor lê; `purge_access_logs` diário. Sem navegador nem aparelho |
| Financeiro, pagamentos, estornos, fiscal | 5 anos | Nunca apagados antes; anonimização preserva as linhas |
| Aceites dos Termos e e-mail de conta excluída | até 5 anos | `deleted_account_identity` (rotina `purge_deleted_identities`) |
| Chamados, denúncias e mensagens | 24 meses após encerrar | `admin_support_decide` (0151) + `purge_support_cases` diário |
| Histórico de atendimento da casa e auditoria da equipe | 12 meses | `handoff_events` e `staff_audit` (rotinas diárias) |
| Mensagens excluídas pelo usuário | 30 dias | `message_archive` (rotina diária) |
| Conversas com a assistente de suporte | 3 dias | `purge_conecta_calls` (rotina diária) |
| Cliques e visualizações brutos de impulsionamento | 24 horas | `promo_events` limpa a cada ciclo de `promotions_tick`; ficam só os totais diários |
| Registro técnico de erros do app, falhas de IA e de funções (`system_events`) | 30 dias | `purge_system_events` diário (0155). **Não identifica a pessoa** (sem conta, IP ou e-mail; o servidor ainda remove e-mails, ids e números longos do texto); só a administração (dono) lê, no cartão Saúde da plataforma. Contador anti-abuso por conta (`client_error_throttle`) some em 3 horas. *Informar ao advogado na próxima rodada, por transparência; não é dado pessoal.* |

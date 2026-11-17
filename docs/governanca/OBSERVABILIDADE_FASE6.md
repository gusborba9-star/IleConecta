# Observabilidade, alertas e resposta a incidentes (Fase 6, 17/11/2026)

Migration 0155 (passos 321–323), app e funções do servidor.

## O que passou a ser registrado
| Sinal | Quem registra | Onde fica | Guarda |
|---|---|---|---|
| Erro inesperado no app (execução, promessa rejeitada, tela que não abre) | O próprio app, com a pessoa logada (`report_client_error`) | `system_events` (`erro_app`) | 30 dias |
| Falha da IA (provedor fora, tempo esgotado, resposta vazia) | Funções `assistant-chat` e `conecta` (`log_system_event`) | `system_events` (`ia_falha`) | 30 dias |
| Erro inesperado nas funções do servidor (pagamentos, cobrança da plataforma, suporte, push) | Cada função, só nos erros que não são do usuário (`log_system_event`) | `system_events` (`funcao_erro`) | 30 dias |
| Rotinas agendadas (pg_cron) | O próprio pg_cron | `cron.job_run_details` (agora limpo a cada 7 dias) | 7 dias |

**Privacidade:** o registro de erros **não identifica ninguém** (sem conta, IP ou e-mail). O app envia só a mensagem do erro, a primeira linha da pilha e o endereço da tela **sem consulta** (o token de convite nunca sai); o servidor ainda troca e-mails, ids e números longos por marcadores. Ruído sem valor (extensões do navegador, internet fora, `ResizeObserver`, abortos) nem é enviado.

## Proteções contra abuso
- Por conta: no máximo 20 relatos por hora; geral: no máximo 600 relatos de app e 1.000 falhas de servidor por hora (uma enxurrada não enche o banco nem esconde o resto).
- No app: o mesmo erro na mesma tela vai uma vez por abertura, no máximo 8 relatos distintos por abertura, e falhar ao relatar nunca aparece para a pessoa.
- O cartão e as leituras são só do dono (`admin_can('dono')`); as tabelas não têm acesso para `anon` nem `authenticated`.

## Painel (Administração > Visão geral > Saúde da plataforma, só o dono)
Estado geral (Tudo certo / Houve erros na última hora / Precisa de atenção), contagens da última hora e de 24 h, os 8 erros mais frequentes, estado de cada rotina agendada (ok, falhando agora, parada, desligada, ainda não rodou), tamanho do banco e conexões, e alertas em aberto.

## Alertas (sino do dono, que também vira push)
A rotina `health-check` roda a cada 10 minutos e avisa **uma vez por problema a cada 6 h**; quando o problema some, o próximo aviso sai na hora.
| Alerta | Condição | O que fazer |
|---|---|---|
| Rotina agendada falhou | Execução com erro nos últimos 30 min | Abrir o cartão, ver a rotina; rodar a função à mão no SQL e ler o erro nos logs do Supabase |
| Rotina agendada parada | Rotina de hora em hora (ou mais frequente) sem rodar há mais de 2 h | Conferir se o pg_cron está ativo e o projeto não está pausado |
| Pico de erros no app | 15 ou mais em 15 min | Ver os erros mais frequentes; se começou depois de uma publicação, reverter na Vercel (Deployments > Promote to Production do anterior) |
| Falhas da IA | 5 ou mais em 15 min | Ver o código do provedor no cartão (`openrouter_429` = limite; `openrouter_5xx` = provedor fora); a assistente já cai no modelo reserva |
| Erros em funções do servidor | 3 ou mais em 15 min | Ver o erro no cartão; pagamentos: conferir o Stripe e a Conferência financeira |

## O que a plataforma NÃO vê sozinha (ações do proprietário, externas)
1. **Monitor de disponibilidade externo** (ex.: UptimeRobot ou Better Stack, planos gratuitos): checar `https://ile-conecta.vercel.app` a cada 5 min, com aviso por e-mail/celular. Se a Vercel ou o Supabase inteiros caírem, a própria plataforma não consegue avisar.
2. **Avisos de entrega de eventos do Stripe**: no painel do Stripe, ativar o e-mail de falha de envio de webhooks.
3. **Avisos de uso/limites** do Supabase e da Vercel por e-mail (Settings > Notifications).
4. **Limite de gasto na chave da IA** (já registrado como pendência no Roadmap §5).
5. E-mail como canal de alerta: entra na etapa final, junto com o domínio e o provedor de e-mail.

## Limites conhecidos (ditos com franqueza)
- Se o próprio `health-check` parasse, ninguém seria avisado: por isso o cartão mostra o estado dele como o das demais rotinas, e o monitor externo (item 1) cobre o resto.
- Erros do app só são relatados com a pessoa logada (a tela de login sem conta não relata).
- Falha de pagamento "esperada" (cartão recusado, divergência) não conta como erro de função: é situação do usuário, não da plataforma.

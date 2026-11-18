# Plano de reversão e resposta a incidentes (Fase 6, 17/11/2026)

Documento operacional. Escrito em linguagem simples para o proprietário; os detalhes técnicos ficam com o executor (Claude).

## 1. Princípios
1. **Primeiro estancar, depois investigar.** Se algo grave está acontecendo, a primeira ação é reduzir o dano (interruptor de emergência ou voltar a versão anterior). A causa se investiga depois.
2. **Reverter é sempre preferível a consertar às pressas** quando a versão anterior funcionava.
3. **Banco de dados só anda para frente.** Não existe "desfazer" automático de migration; a correção é uma nova migration escrita e verificada (ver 4.3). Por isso mudanças arriscadas no banco são feitas com cópia prévia dos dados afetados e verificação em simulação com reversão antes de valer.
4. **Dinheiro já cobrado não some sozinho.** Pagamento feito no Stripe só é desfeito por reembolso (decisão do proprietário).
5. **Todo incidente vira registro** e, se foi falha nossa, um teste que impede a repetição.

## 2. Níveis de gravidade
| Nível | O que é | Meta de resposta |
|---|---|---|
| **P1** | Site fora; pagamento cobrando errado; dados vazando ou perdidos; segurança comprometida | Estancar em minutos |
| **P2** | Uma função importante quebrada (pagamento não inicia, assistente não responde, agenda não salva) | Corrigir ou reverter em até 1 hora |
| **P3** | Erro visual, texto errado, falha rara sem perda | Corrigir na rotina normal |

## 3. Os primeiros 5 minutos
1. **Confirmar** o que está acontecendo (Administração > Visão geral > Saúde da plataforma mostra erros da última hora, rotinas agendadas e alertas).
2. **Estancar**, conforme o caso:
   - Custo ou falha da IA → ligar **Interruptor de emergência: Assistente**.
   - Cobrança ou pagamento errado → ligar **Interruptor de emergência: Pagamentos** (bloqueia novos pagamentos e a cobrança automática de cartões salvos; reembolsos e webhooks continuam).
   - Versão nova do site com defeito → reverter o site (4.1).
3. Os usuários passam a ver o aviso "estamos em manutenção, voltamos em breve" (sem enxurrada de reclamações).
4. **Avisar o executor** (Claude) descrevendo o que viu. O alerta de manutenção ligada há mais de 1 hora lembra de desligar.

O proprietário pode ligar o interruptor sozinho, a qualquer hora, pelo celular. Não precisa esperar diagnóstico.

## 4. Como reverter cada camada
### 4.1 Site (Vercel) — segundos
- Cada publicação anterior fica guardada. Voltar é promover a versão anterior marcada como candidata a reversão (Vercel > Deployments > "Instant Rollback", ou o executor faz pela integração).
- Não mexe no banco nem nas funções. Depois da reversão, o executor corrige o código por pull request normal (com CI) e publica a correção.
- Atenção: se a versão ruim dependia de uma mudança de banco já aplicada, o site anterior continua funcionando porque as migrations são feitas compatíveis (primeiro o banco, depois o código).

### 4.2 Funções do servidor (pagamentos, cobrança da plataforma, assistente, suporte, Conecta, push)
- **Caminho normal (~10 min):** desfazer o pull request ruim no GitHub (revert), e disparar o fluxo "Deploy de funções" (roda os testes antes). Uma função por vez.
- **Caminho de emergência (~2 min):** o executor reimplanta o código da versão anterior da função direto no Supabase, tirando os arquivos do histórico do GitHub, e em seguida registra o revert no repositório para o código não divergir.
- Enquanto isso, o interruptor de emergência mantém os usuários protegidos.

### 4.3 Banco de dados (Supabase) — só para frente
- **Migration ruim:** o executor escreve uma migration corretiva (idempotente), testa no banco local e na produção em simulação com reversão, aplica e confere o resultado. Dados alterados por engano são restaurados a partir da cópia prévia tirada antes de qualquer mudança arriscada.
- **Dados apagados/corrompidos:** depende de backup. **Plano Free não tem backup baixável.** Ao migrar para o **Supabase Pro** passam a existir backups diários; recuperação por ponto no tempo (PITR) é um adicional pago. Recomendação: contratar o Pro antes do lançamento e avaliar o PITR. *(O plano atual não é verificável pelo executor; confirmar no painel.)*
- Nunca mexer em dados de produção sem simulação com reversão antes.

### 4.4 Stripe
- Pagamentos já feitos só se revertem por reembolso (fluxo existente no painel administrativo). A decisão de reembolsar é do proprietário.
- Cobranças duplicadas ou erradas: ligar interruptor de Pagamentos, listar casos pelo registro de pagamentos, o executor prepara a lista e o proprietário aprova os reembolsos.
- Limite conhecido: páginas de pagamento do Stripe abertas antes do interruptor ainda podem ser pagas; o pagamento é registrado normalmente pelo webhook.

### 4.5 Chaves e acessos
- **Chave vazada ou conta suspeita:** a rotação é feita pelo proprietário nos painéis (Stripe, OpenRouter, Supabase, GitHub, Vercel); o executor atualiza os segredos nas funções e reimplanta. Nunca enviar chaves pelo chat.
- Ligar a verificação em duas etapas (MFA) na conta do proprietário e nos painéis é pendência registrada.

## 5. Quem faz o quê
| Ação | Proprietário | Claude |
|---|---|---|
| Ligar/desligar interruptor de emergência | Pode, a qualquer hora | Pode orientar e conferir |
| Diagnosticar causa (logs, banco, deploys) | — | Faz |
| Reverter site / função | Pode pelo painel Vercel | Faz |
| Migration corretiva e verificação | — | Faz |
| Aprovar reembolsos e comunicação oficial aos usuários | Decide | Prepara lista e texto |
| Painéis externos (Stripe, OpenRouter, Supabase plano, domínio, rotação de chaves, MFA) | Faz | Orienta passo a passo |
| Registro do incidente e teste de regressão | Lê | Escreve |

## 6. Cenários
| Cenário | Sinais | Ação |
|---|---|---|
| **Publicação ruim do site** | Tela branca, erros do app em alta na Saúde | Reverter o site (4.1); corrigir por PR |
| **Assistente falhando ou caro** | "Falhas da IA" em alta; gasto no OpenRouter | Interruptor Assistente; checar provedor/limite; reativar depois do teste |
| **Pagamentos/webhooks falhando** | Erros em funções de pagamento; Stripe mostra webhooks falhando | Interruptor Pagamentos; conferir assinatura/segredo do webhook; reprocessar eventos pela conferência (sync) |
| **Banco lento ou no limite** | Conexões altas, tamanho perto do limite do plano | Pausar tarefas pesadas, rever consultas/índices, avaliar plano Pro |
| **Migration com efeito indevido** | Dados estranhos após passo de banco | Parar novos passos; migration corretiva (4.3); restaurar da cópia prévia |
| **Chave vazada / conta comprometida** | Aviso do provedor, uso incomum | Rotacionar chaves (4.5), revisar auditoria administrativa, reimplantar funções |
| **Provedor fora (Supabase, Vercel, Stripe, OpenRouter)** | Página de status do provedor | Interruptor correspondente; aguardar; comunicar se longo |

## 7. Comunicação com os usuários
- Aviso automático pelo interruptor (faixa "manutenção"), com mensagem opcional editável.
- Manutenção deve ser curta (meta ≈ 1 hora). Vencimentos e tolerâncias **não** são congelados (decisão do proprietário).
- Em incidente com impacto financeiro ou de dados, o texto aos usuários e a eventual notificação legal (LGPD) são decididos pelo proprietário com o advogado.

## 8. Depois do incidente
1. Registrar: o que aconteceu, quando, impacto, causa, o que fez voltar, o que muda.
2. Escrever teste que reproduz a falha antes da correção.
3. Atualizar ROADMAP/Blueprint se alterou regra ou arquitetura.

## 9. Lacunas e pendências
- Backup real: depende do Supabase Pro (e PITR opcional).
- Monitor externo de disponibilidade (ex.: verificação de a cada minuto) e avisos por e-mail do Stripe, Supabase e Vercel: ações do proprietário nos painéis.
- MFA na conta do proprietário e nos painéis.
- Domínio próprio (`ileconecta.com.br`) ainda não configurado: reversão de DNS fica documentada quando houver.
- Simulação de reversão de ponta a ponta em produção real só no pré-lançamento (não faz parte desta fase).

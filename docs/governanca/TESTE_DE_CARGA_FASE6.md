# Teste de carga da Fase 6 (17/11/2026)

Objetivo: saber o que a plataforma aguenta antes do lançamento e corrigir o que limita.

## Metas definidas pelo proprietário
- **Lançamento:** estimativa de 10 casas e 60 clientes.
- **Dimensionamento (folga):** 200 casas, 1.200 clientes e 4.000 membros com conta (membros interagem e pagam mensalidade) = 5.400 contas; pico estimado de 10% simultâneo (~540 pessoas).

## Como foi medido
Banco local com todas as migrations (0001–0147) e dados simulados em `scripts/carga/` (`montar_banco.mjs`, `semear.mjs`, `medir.mjs`, `simultaneo.mjs`): 200 casas, 5.400 contas, 4.000 membros em casas de tamanhos desiguais (a maior com ~370), 12 mil mensalidades, ~19 mil seguidores, 5 mil publicações, 160 mil curtidas, 25 mil comentários, 3 mil conversas com 60 mil mensagens, ~97 mil avisos, 8 mil pedidos e 13 mil pagamentos. A máquina de teste tem 2 núcleos, parecida com o menor servidor pago do Supabase; o gerador de carga roda na mesma máquina, então os números são conservadores.

## Resultados (uma pessoa por vez)
| Consulta | Tempo (mediana) |
|---|---|
| Feed (50 posts com curtidas e comentários) | 293 ms antes do índice, **22 ms depois** (dados normais) |
| Contagem de curtidas dos 50 posts | 258 ms antes, **3 ms depois** |
| Lista de casas (200) | 12 ms |
| Resumo de seguidores / casas ocultas | 2 ms / 6 ms |
| Conversas, mensagens, avisos, presença | menos de 1 ms |
| Painel da casa (pessoas, indicadores, pendências) | 1 a 6 ms, casa grande ou média |
| Feed com 10 posts de 3.000 curtidas e 300 comentários | 190 ms e 1 MB (os comentários são o custo) |

## Resultados (40 conexões ao mesmo tempo, mistura realista, 40 s)
156 operações por segundo sustentadas, sem nenhum erro. O pico estimado de 540 pessoas simultâneas representa cerca de 50 a 60 operações por segundo; há folga de ~3 vezes nesta máquina de 2 núcleos. Sem o índice do feed a mesma carga caiu para 13 operações por segundo (feed com mediana de 9,8 s num banco com posts muito comentados).

## O que foi achado e corrigido (migration 0148, passos 313–314)
1. **Feed sem índice por data:** o banco lia todas as publicações e aplicava a regra de visibilidade em cada uma para mostrar as 50 mais novas; o custo crescia com o número de posts. Índice `posts_created_idx`.
2. **Tempo real sem filtro:** o app ouvia mensagens, pedidos, reservas e reembolsos sem filtro, e o servidor de tempo real conferia a permissão de todos os conectados a cada mudança. Agora cada pessoa ouve só a própria linha de `live_pings` (um aviso por assunto, sem conteúdo); gatilhos de instrução (uma vez por operação, mesmo com 50 mensagens) avisam só os envolvidos e nunca derrubam a operação principal. A retirada das tabelas antigas do tempo real é a migration 0149 (passo 315), a rodar depois do app novo no ar.
3. **Comentários do feed sob demanda (migration 0150, passo 316; aprovado pelo proprietário):** o feed trazia todos os comentários de cada post (10 posts de 300 comentários = 633 KB e 178 ms). Agora traz só a contagem (6 KB e 10 ms) e a lista é lida ao abrir (2 ms para 300 comentários), com "Carregando", erro com "Tentar de novo", contagem que sobe ao comentar e leitura nova se a contagem mudar. A contagem respeita a regra de leitura (comentário oculto só conta para a casa e para quem escreveu).
4. **Presença a cada 15 s:** medida em 0,4 ms por chamada (~36 por segundo no pico = cerca de 1% de um núcleo). **Não foi alterada**: o ganho não justifica mexer na regra de 35 s da casa online.

## Riscos que dependem de decisão ou de ação do proprietário
- **Plano gratuito do Supabase** (pausa por inatividade, sem backup diário, 200 conexões simultâneas de tempo real): migrar para o Pro antes do lançamento (decisão do proprietário, 17/11/2026).

## Ainda por medir
Tempo real e plano de produção só se validam em produção depois do Pro; dia de mensalidade (4.000 confirmações do Stripe no mesmo dia); reserva simultânea da mesma vaga; carga de imagens e Core Web Vitals no celular; custo e latência da IA.

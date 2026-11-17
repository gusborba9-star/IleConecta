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

## Dia de mensalidades (migration 0153, passo 319)
Banco de carga: 4.000 membros em 200 casas. A rotina diária criou as 4.000 mensalidades do mês e os avisos em 231 ms; repetida, não criou nada nem avisou de novo. O Stripe confirmou as 4.000 de uma vez por 30 conexões: 2.067 por segundo, mediana 13 ms, p95 25 ms, zero erros. Reenvio de 500 confirmações e o mesmo pagamento 20 vezes ao mesmo tempo: tudo "já confirmado", sem lançamento nem aviso duplicado. Conferência: 4.000 pagas, 0 abertas, todo pagamento com os 3 lançamentos e a soma certa.
**Defeito achado e corrigido:** a tarifa do Stripe de mensalidade ficava gravada no pagamento, mas não virava o lançamento `taxa_provedor` da casa (a casa só era descoberta por ritual ou serviço), então o painel financeiro mostrava tarifa 0. Corrigido na 0153 (aplicada e verificada em produção); no teste, 200 tarifas passaram de 0 para 200 lançamentos.

## Reserva simultânea da última vaga
70 pessoas pedindo ao mesmo tempo um ritual de 10 vagas: 10 reservaram, 60 receberam "Vagas esgotadas", o banco conta 10 ocupadas, ninguém passou do limite (339 ms). Duplo clique (15 pedidos simultâneos da mesma pessoa): 1 reserva, 14 respostas "Você já tem vaga".

## Celular (4G lento, processador 4 vezes mais lento, com brotli)
Carregamento por tela (cada página só é baixada quando a pessoa chega nela; entrada, feed e página inicial da casa ficam no pacote principal): a primeira carga caiu de **316 KB para 210 KB (-33%)** e a primeira tela de ~2,2 s para **~1,6 s**; sem deslocamento de layout (CLS 0) e bloqueio de 17 a 54 ms. Falha ao baixar uma tela mostra aviso com "Tentar de novo" (uma recarga automática, nunca em laço). Imagens reais do feed logado ainda não foram medidas.

## Custo e tempo de resposta da IA (migration 0154, passo 320)
**Defeito 1 — limite furado por pedidos simultâneos.** A função da assistente conferia o limite por pessoa (20 em 10 min), a franquia do mês e o saldo de créditos antes de chamar o modelo e só gravava o uso depois. Atacado de propósito no banco local (60 pedidos ao mesmo tempo, modelo simulado com 300 ms): com 5 respostas restantes na franquia, **59 responderam e o mês fechou em 154 de 100**; uma só pessoa passou do limite de 20 com 60 respostas; uma casa Grátis com saldo de 3 créditos teve 30 respostas (27 sem crédito para pagar). Corrigido com a reserva atômica `assistant_reserve` (cada resposta em andamento entra na conta da franquia, do crédito e do limite por pessoa e é liberada ao fim, com validade de 120 s para o caso de a função cair no meio). Depois da correção, nas mesmas condições: exatamente 5 respostas, exatamente 20, exatamente 3 (cada uma gastou 1 crédito, saldo 0), e franquia 2 + créditos 2 = exatamente 4. Reserva presa expira sozinha; 200 reservas+liberações (40 por vez) levam cerca de 1,3 s, 6,5 ms cada.
**Defeito 2 — a casa escolhia o modelo.** O dono da casa conseguia gravar em `assistants.model` o nome de qualquer modelo do provedor (inclusive um caro) e a função o usava como primeiro modelo; a plataforma pagaria o preço dele cobrando 1 resposta. Agora o banco só aceita o modelo vindo da administração ou do próprio banco (para a casa, vira "padrão") e a função só usa modelos da lista da plataforma. Em produção nenhuma casa tinha modelo gravado.
**Latência da função:** as quatro leituras iniciais (interruptor, cobrança, matriz de planos e assistente) passaram a ir juntas, uma ida ao banco em vez de quatro em fila. O tempo dominante é o do modelo (limite de 25 s por resposta, com modelo reserva de outro fornecedor).
**Tamanho do que se manda ao modelo (estimativa por caracteres, ~3,3 por token):** assistente da casa, casa vazia ≈ 1.600 tokens; casa no máximo permitido (30 serviços, 15 rituais, 30 itens de catálogo, 80 datas, instruções de 2.000 letras) ≈ 22.000 tokens, mais até 20 mensagens de histórico; Conecta (suporte) ≈ 12.000 tokens por mensagem (a base de conhecimento é o grosso), mais até 10 mensagens de histórico. Limites já existentes e conferidos: 1.000 letras por mensagem, resposta no máximo 600 a 1.500 tokens, Conecta 20 por hora e 80 por dia por pessoa (conferência atômica), assistente 20 por 10 min por pessoa.
**Recomendações que dependem do proprietário (não alteradas):**
1. Definir um limite mensal de gasto na própria chave do provedor de IA (OpenRouter): é o freio final contra qualquer abuso desconhecido e só o dono consegue configurar.
2. Cache do prefixo do Conecta: hoje os dados da conta ficam no meio do texto e impedem o reaproveitamento dos ~12.000 tokens fixos entre mensagens; colocá-los no fim permitiria o cache do provedor (custo e tempo menores). Muda a ordem de um texto ajustado à mão, então só vale mexer junto com uma rodada do "Teste da assistente" do painel (que usa a chave real e só o proprietário roda).

## Riscos que dependem de decisão ou de ação do proprietário
- **Plano gratuito do Supabase** (pausa por inatividade, sem backup diário, 200 conexões simultâneas de tempo real): migrar para o Pro antes do lançamento (decisão do proprietário, 17/11/2026).

## Ainda por medir
Tempo real e plano de produção só se validam em produção depois do Pro; peso real das imagens do feed logado no celular; observabilidade, acessibilidade e plano de rollback.

# Proposta no papel: painéis e menus (casa, cliente, administração)

Data: 20/11/2026 · Situação: **aguardando aprovação do proprietário** (nenhum código foi alterado).
Origem: ROADMAP, etapa de layout e navegação (pedidos de 11, 12 e 15/11/2026).

## 1. O que existe hoje (levantamento no código)

| Visão | Tela | Blocos empilhados numa só rolagem |
|---|---|---|
| Casa | Início (`HouseHome`) | ~14 (aviso de cobrança, cabeçalho, pendências, indicadores, conta de recebimento, promoções, compartilhar, indicar, relatório da assistente, avisos sociais, horário de silêncio, modo discreto…) |
| Casa | Planos (`Plans`) | ~17 (reativar, CPF/CNPJ, alerta de cobrança, plano atual, vender na plataforma, 4 planos, comparação, créditos da assistente, cartão automático, faturas, pedidos, cancelar…) |
| Casa/Cliente | Perfil (`Profile`) | capa, assistente, tema, modo discreto, "Reservas demonstrativas" |
| Administração | Configurações | ~20 cartões (preços, taxas, limites, planos, música, denúncias, manutenção, saúde, operador, avaliação da assistente…) |
| Administração | Visão geral | pendências, saúde, manutenção, indicadores, métricas |

Menu lateral (computador) e "Mais" (celular) já são **o mesmo** (`navConfig.ts`). Casa: 5 grupos e 14 itens; cliente: 3 grupos e 9 itens.
Limite desta análise: os testes usam dados de mentira, então as alturas reais só serão medidas na implementação (captura de tela antes/depois, com dados de verdade).

## 2. Princípios

1. **Uma tela, uma tarefa.** Quem entra em "Planos" para pagar uma fatura não precisa rolar até ela passando por comparação de planos.
2. **O que exige ação sobe; o que é configuração desce.** Pendências e cobranças no topo; preferências recolhidas.
3. **Recolhido por padrão, lembrado por pessoa** (preferência guardada no aparelho, sem ir ao banco). Só o primeiro bloco da tela abre sozinho.
4. **Abas dentro da tela** quando os blocos são de assuntos diferentes (padrão já usado no financeiro da administração).
5. **Nada muda de lugar sem deixar rastro**: rotas atuais continuam funcionando (redirecionam), e os testes de acessibilidade (axe, teclado, 320 px, texto a 200%) cobrem cada tela nova.

## 3. Proposta por painel

### 3.1 Casa
- **Início** = resumo + o que precisa de você: aviso de cobrança, pendências, indicadores. Abaixo, três blocos recolhidos: *Divulgar* (compartilhar página + indicar), *Assistente* (relatório), *Preferências rápidas* (horário de silêncio, modo discreto, avisos sociais).
- **Planos** vira 3 abas: *Meu plano* (plano atual, reativar, cartão automático, cancelar) · *Mudar de plano* (4 planos + comparação) · *Cobranças* (faturas, pedidos, créditos da assistente). CPF/CNPJ vai para "Dados da casa" no perfil.
- **Faturas em destaque** (pedido de 12/11): etiqueta com o número de faturas abertas no item "Planos" do menu e no Início; um toque leva direto à aba *Cobranças*.
- **Pedidos recebidos**: "Em andamento" aberto e "Histórico" recolhido, mais novo primeiro.
- **Serviços**: tirar a etiqueta "Privado" do cartão (já existe o bloco "Privados"); ao cadastrar serviço com nome e valor iguais a outro, avisar a casa.
- **Menu da casa** (proposta de ordem): *Principal* (Início, Mensagens, Membros) · *Minha casa* (Minha página, Perfil e assistente, Equipe, Divulgação) · *Crescer* (Planos, Impulsionar, Destaques; mantêm o dourado) · *Explorar* (Comunidade, Casas, Rituais — por último, porque é consumo, não gestão) · Termos e Suporte.
- **Impulsionar e Destaques** viram uma tela "Crescer" com duas abas (hoje são duas telas de mesma finalidade). *Decisão sua (ver 5).*

### 3.2 Cliente
- **Minha conta** reúne Perfil · Atividade · Mensalidades como abas (hoje são 3 itens de menu). Preferências (tema, modo discreto, assistente) numa aba só.
- Menu cliente cai de 9 para 7 itens.
- **"Reservas demonstrativas"** no Perfil é resto de protótipo ("registros locais de simulação"). *Pergunta ao proprietário (ver 5).*

### 3.3 Administração
- Já tem 7 seções (abas). **Configurações** é a que pesa: dividir em 4 sub-abas: *Preços e planos* (matriz de planos, planos das casas, mudança de preço, taxas, limites de pagamento e promoção) · *Cobrança e impostos* (cobrança da plataforma, CPF/CNPJ) · *Conteúdo e música* (biblioteca de músicas, denúncias de Momentos, chats e avaliações, moderação) · *Plataforma* (manutenção, saúde, avisos, identificação do operador, avaliação da assistente, contas que voltaram, auditoria da equipe). Distribuição final conferida cartão a cartão na implementação.
- **Busca "Ir para…"** no topo da administração (digita "música", "reembolso", "operador" e abre a aba certa). Só na administração e no Início da casa; no cliente não compensa.
- Visão geral: pendências primeiro (já é assim), saúde e manutenção só para o dono (já é assim), indicadores recolhidos.

## 4. Como será feito (depois da aprovação)
1. Componente único `Secao` (recolhível, lembra o estado) e `Abas` (teclado, leitor de tela), com testes próprios.
2. Uma visão por vez, nesta ordem: **casa → cliente → administração**, cada uma em PR separado, com captura de tela antes/depois no celular (375 px) e no computador.
3. Roteiro de rotas antigas (redirecionamento) e atualização do Blueprint/ROADMAP a cada visão.
4. Sem mudança de banco nem de regra comercial.

## 5. Decisões que são suas
1. Juntar **Impulsionar + Destaques** numa tela "Crescer" com abas? *Minha opinião: sim.*
2. Juntar **Perfil + Atividade + Mensalidades** na tela "Minha conta" do cliente? *Sim.*
3. **Remover "Reservas demonstrativas"** do Perfil (é de protótipo; reservas reais ficam em Atividade/Mensalidades)? *Sim, remover.* Divergência com o Blueprint? A conferir antes: se o Blueprint pede essa seção, trago a você.
4. Colocar **Explorar por último** no menu da casa? *Sim: a casa abre mais a gestão do que o feed.*
5. Busca "Ir para…" na administração e no Início da casa? *Sim.*
6. Ordem de execução casa → cliente → administração? *Sim, porque a casa é quem paga e mais usa o celular.*

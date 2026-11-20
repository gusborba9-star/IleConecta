# Acessibilidade (Fase 6) — 17/11/2026

Referência: Blueprint §27 (teclado, contraste, semântica, foco visível) e WCAG 2.2 nível AA. Decisão do proprietário (11/11): mudanças de layout e navegação ficam na etapa própria; esta frente só mexeu no que não muda o desenho das telas.

## Como foi medido
- **axe-core** (regras WCAG 2.0/2.1/2.2 A e AA + boas práticas) em 36 telas e estados: sem login, pessoa/administração e conta de casa; celular (375) e computador (1280); tema claro e escuro. Teste: `tests/ui/a11y-axe.spec.mjs` (12 grupos). Antes: 86 trechos sem `main`/título, 40 de contraste, 26 menus sem nome, links só por cor, tabela rolável sem teclado. Depois: **0**.
- **Teclado:** `tests/ui/a11y-teclado.spec.mjs` percorre com Tab as telas principais e confere que todo elemento focado mostra indicador visível (com um teste de controle que prova que o teste enxerga a falta dele), o "Ir para o conteúdo", o título por tela e o sino fechando com Esc.
- Título por tela: `tests/route-title.test.mjs` (também falha se uma rota nova for criada sem título).

## O que foi corrigido
| Problema | Correção |
|---|---|
| Entrar, cadastro e recuperação sem região principal (`main`) nem título principal | `main` e `h1` nessas telas (inclusive "Confirme seu e-mail") |
| Telas sem título principal (Mensagens, Destaques para cliente, Casa indisponível, Membros sem plano) | `h1` (visível onde já havia título; invisível só para leitor de tela quando não há) |
| Menus e áreas laterais sem nome (leitor de tela não os distingue) | `aria-label`: Principal, Menu principal, Menu lateral, Complementos, Mais opções, Conversas |
| Contraste do texto em cor primária no tema escuro (4,27:1; mínimo 4,5:1) e botão com texto claro (3,86:1) | Dois tons no tema escuro: botão `--primary` 12 72% 46% (texto claro 4,68:1) e texto em destaque `--primary-ink` 12 72% 62% (5,6:1). O tema claro não mudou |
| Item ativo do menu da administração em laranja sobre fundo verde (4,0:1) | Texto na cor normal e em negrito; a barra lateral e o fundo seguem indicando o item ativo |
| "Não perturbe" desligado com texto a 50% de opacidade (2,8:1) | Só os campos desabilitados ficam esmaecidos; os textos mantêm contraste |
| Links dentro de texto só distinguíveis pela cor (Termos e Privacidade no cadastro) | Sublinhados |
| Tabelas com rolagem lateral inacessíveis ao teclado | Região nomeada e focável (planos, documentos, tabela da administração) |
| Sem "pular para o conteúdo" | Primeiro item da tabulação, aparece ao receber foco e leva ao conteúdo |
| Título da aba igual em todas as telas | Título por tela + aviso "Página: X" para leitor de tela ao trocar de tela |
| Sino de notificações sem Esc | Esc fecha; área nomeada |

## O que já estava bem (confirmado)
Idioma `pt-BR`; janelas (`Modal`) com `role=dialog`, `aria-modal`, nome, foco preso, Esc e retorno do foco; foco visível em todos os controles testados; respeito a "reduzir movimento".

## Limites (honestos)
- Automação cobre cerca de metade dos critérios. Não foi testado com leitor de tela real (TalkBack/VoiceOver/NVDA), nem zoom de 200% em todas as telas, nem janelas abertas por fluxos específicos com axe.
- Carrossel de destaques (pedido para a etapa de layout) deve nascer com setas, toque, leitor de tela e contraste; o teste `a11y-axe` já vale para ele quando existir.
- Recomendado antes do lançamento: uma passada manual de 30 min com TalkBack (celular) nas telas de entrada, compra de vaga e mensagens.


## Cobertura ampliada — 19/11/2026
Teste novo `tests/ui/a11y-cobertura.spec.mjs` (45 testes) e ampliações em `a11y-teclado`, `momentos` e `momentos-musica`.
- **Mais telas no axe:** `/sobre/*` (9 páginas), 404, `/redefinir-senha`, créditos de áudio, chamados, pessoas, convites, retorno de pagamento, detalhe de ritual inexistente, `/admin?s=` (7 seções); janela de publicar com filtros de música (claro e escuro).
- **Reflow (WCAG 1.4.10):** 11 telas em 320 px sem rolagem lateral. **Texto a 200% (1.4.4)** e **espaçamento de texto (1.4.12):** as mesmas 11 telas, sem rolagem lateral da página (tabelas largas continuam em região rolável nomeada).
- **Corrigido:** 404 (`main`, `h1`, botão fora do link); detalhe de ritual inexistente e seções da administração com título principal; barra do topo e caixa da Conecta em 320 px; quebra de palavras longas em cadastro, comunidade e administração; foco preso (Tab/Shift+Tab) no visualizador e no editor de Momentos (hook `useFocusTrap`) e na janela de denúncia; botão "Pausar/Continuar momento" (WCAG 2.2.2), que também para a música (1.4.2 já tinha o botão de som).
- **Controle:** os testes de foco falham sem a correção (provado removendo-a).
- **Limites que continuam:** leitor de tela real (TalkBack/VoiceOver) e zoom do navegador em todos os fluxos não foram testados; recomendado: 30 min de TalkBack antes do lançamento. A barra do topo foi ajustada só abaixo de 380 px; reorganizar a navegação segue na etapa de layout.

# Rascunho — Política de Privacidade: visitas e interesse nas páginas das casas

Status: **orientação do advogado recebida em 24/11/2026; texto integrado em `src/content/institutional.ts` (versão 2026-11-rascunho-23) num branch AINDA NÃO MESCLADO, a pedido do proprietário**. O registro (migração 0219) está construído e **desligado** (`features.house_signals`); só liga depois da revisão deste texto.
Redação final e arquitetura são decididas pelo operador; o que importa é cumprir o que a lei pede.

## Texto proposto (nova seção, ao lado de "Métricas de visualização e impulsionamento")

**Visitas e interesse nas páginas das casas**

Para que cada casa saiba quantas pessoas viram a sua página, abriram um serviço ou ritual e compartilharam a página, o Ilê Conecta conta essas ações.
Guardamos apenas **totais por casa e por dia** (por exemplo, "80 pessoas viram a página hoje"). A casa nunca vê quem visitou.

Para não contar a mesma pessoa mais de uma vez no mesmo dia, geramos um código técnico a partir da sua conta (ou, se você não tem conta, de um código aleatório do seu aparelho),
misturado ao dia, à casa e a um segredo da plataforma. Esse código não permite identificar você nem acompanhar você de um dia para o outro ou de uma casa para outra,
e é **apagado ao fim do próprio dia (horário de Brasília)**. Os totais diários ficam por **13 meses**.

Não contamos visitas da própria casa nem da equipe. Se o seu navegador envia o sinal "não rastrear" (Do Not Track) ou o Controle Global de Privacidade, nenhuma contagem é feita.

Base legal: legítimo interesse (LGPD, art. 7º, IX) — oferecer às casas indicadores do próprio desempenho e proteger a plataforma contra uso abusivo.

## O que já temos (como está implementado)
- Tabela de chaves do dia (`house_signal_seen`): casa, dia, tipo e chave HMAC-SHA256 (dia + casa + conta ou código do aparelho + segredo do servidor). Sem id de usuário. Apagada de hora em hora para dias que já passaram.
- Totais (`house_signal_daily`): casa, dia, tipo, eventos e pessoas distintas. Retenção de 13 meses (mesma regra do funil atribuído, 0174).
- Três tipos: visita à página, abertura de serviço/ritual, compartilhamento da página. Seguidores, conversas, pedidos e pagamentos já têm indicador próprio.
- Exclui a titular, a equipe e quem tem "não rastrear" ativado. Máximo de 20 repetições por pessoa, dia e tipo.
- Sem conta, o aparelho guarda um código aleatório diário no armazenamento local do navegador (`ic_sig`), que muda todo dia.
- Desligado por padrão; só a administração liga.

## O que pretendo
Ligar o registro depois do parecer, mostrando na tela da casa o grupo "Visibilidade" (visitas, pessoas que viram, abriram oferta, compartilharam, e as taxas do funil) com comparação ao período anterior.

## Dúvidas por ponto (para o advogado)
1. **Natureza do dado.** O código diário (HMAC com segredo do servidor, sem id de usuário, apagado ao fim do dia) pode ser tratado como dado anonimizado (art. 12) ou continua sendo dado pessoal pseudonimizado? Isso muda o que precisamos informar.
2. **Base legal.** Legítimo interesse (art. 7º, IX) é adequado? Precisamos de teste de balanceamento (LIA) por escrito? Há necessidade de consentimento para quem não tem conta?
3. **Armazenamento no aparelho.** Para visitante sem conta usamos um código aleatório diário no armazenamento local do navegador. Pelo Guia de Cookies da ANPD, isso exige banner/consentimento ou é aceitável como medição estritamente necessária para o serviço? Se exigir, preferimos contar só quem tem conta e deixar o visitante sem conta de fora.
4. **Opt-out.** Respeitamos "não rastrear" e Controle Global de Privacidade. É suficiente, ou é preciso um botão próprio na Política/Configurações?
5. **Retenção.** Totais por 13 meses e chaves apagadas ao fim do dia. Está adequado e proporcional?
6. **Termos da Casa.** Incluir que a casa recebe só totais, que não pode tentar identificar visitantes a partir deles e que a plataforma não garante que os números sejam exatos (aparelhos diferentes contam como pessoas diferentes)?

## Orientação do advogado (24/11/2026) e o que mudou
1. Natureza: o código é pseudonimizado enquanto existe (no máximo um dia); depois de apagado, o que resta são totais anônimos (art. 12). Manter o texto transparente (feito).
2. Base legal: legítimo interesse adequado, com e sem conta, sem consentimento. LIA interna atualizada em `LIA_VISITAS_E_INTENCOES.md`.
3. Armazenamento no aparelho: não exige banner; basta a transparência na Política. **Contamos todos, inclusive visitantes sem conta** (nenhuma mudança no código).
4. Opt-out: DNT e GPC bastam; botão próprio é opcional.
5. Retenção: adequada (chave até o fim do dia; totais 13 meses).
6. Termos da Casa: incluir parágrafo curto (feito, na seção "Métricas de desempenho e conversões atribuídas").

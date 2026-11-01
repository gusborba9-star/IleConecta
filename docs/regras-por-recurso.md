# Regras do Ilê Conecta por recurso

Rascunho para revisão do dono da plataforma. As regras são decisão do Ilê Conecta; as casas escolhem entre opções predefinidas.

## Princípios

1. **Ilê Conecta define as regras, a casa escolhe entre opções.**
2. **Velocidade é regra de projeto.** A assistente responde com uma única chamada ao modelo por mensagem.
   - Este documento é para pessoas. O modelo só recebe guias curtos (3 a 6 linhas) dos recursos que a casa realmente tem.
   - A intenção é detectada por código (palavras-chave e estado da conversa), sem chamada extra ao modelo.
   - O servidor consulta agenda, vagas e preço antes da chamada e entrega os dados prontos no prompt.
   - Ferramentas só para ações (reservar vaga, bloquear horário), nunca para informar.
   - Os cenários de teste passam a medir tempo de resposta e tamanho do prompt.
3. **A assistente nunca inventa** preço, vaga, horário, botão ou regra. Sem o dado, passa para a casa.

## Resumo

| Recurso | Quem vende | Comissão | A casa pode desligar a venda? | Campos obrigatórios |
|---|---|---|---|---|
| Ritual coletivo | Assistente, pela plataforma | 15% | Não | nome, vagas, valor, dia, hora, descrição |
| Trabalhos, serviços, rituais não coletivos | Assistente, pela plataforma (padrão) | 4% | Sim (vê os benefícios que perde) | nome, valor, data/hora, descrição |
| Jogos | Assistente, só com hora marcada | 4% | Sim | nome, valor, horários, descrição |
| Agenda/Calendário | Ninguém: só publicação | n/a | n/a | título, data, hora |
| Área de membros | A casa define; membro paga por Pix na plataforma ou direto à casa | 4% (Pix na plataforma) | Sim (pagamento direto) | mensalidade e vencimento por membro |
| Catálogo interno | Ninguém: só alimenta a assistente | n/a | n/a | nome, descrição |

## Ritual coletivo

- Sempre conduzido e vendido pela assistente, pela plataforma.
- A casa preenche todos os campos; sem eles o ritual não é publicado.
- A assistente cita vagas restantes só quando forem 5 ou menos.
- Reembolso e forma de pagamento são explicados só quando a pessoa decide participar ou pergunta como pagar.

## Trabalhos, serviços e rituais não coletivos

- Vendidos pela assistente por padrão.
- Ao desligar a venda, a casa vê o que perde: vendas 24h, pagamento registrado e histórico, avaliações de compras pela plataforma, reembolso automático antes de a casa começar, menos negociação manual.
- Com a venda desligada, a assistente informa nome, valor e modalidade, não indica botão e passa para a casa quando a pessoa quer contratar.

## Jogos

- Só com hora marcada.
- Etapa futura: a assistente consulta a agenda, vende, reserva e bloqueia o horário e avisa a casa.

## Agenda

- Só publicação, nunca venda.
- Quando a pessoa quer participar, a assistente passa o interesse para a casa na mesma mensagem, sem perguntar mais nada, e diz que a casa confirma.

## Área de membros

- Interna à casa.
- A casa define mensalidade e vencimento de cada membro.
- O membro paga pela plataforma (Pix, 4%) ou direto à casa.

## Catálogo interno

- Alimenta apenas a assistente; não é público.

## Planos

| Plano | Assistente | Vende | Descontos |
|---|---|---|---|
| Essencial | Não | n/a | n/a |
| Profissional | 300 respostas/mês | Sim | Não |
| Premium | 3.000 respostas/mês | Sim | Sim, dentro do limite da casa |

## Perguntas em aberto (decisão sua)

1. Descrição mínima nos validadores de ritual e serviço: quantos caracteres?
2. Jogos: comissão de 4% está certa?
3. Tempo de retenção da vaga/horário antes do pagamento: 15 minutos serve?
4. Modo "assistente vende, casa aprova antes de cobrar": entra ou fica para depois?

# Regras do Ilê Conecta por recurso

Revisado e aprovado pelo dono da plataforma em 01/11/2026. As regras são decisão do Ilê Conecta; as casas escolhem entre opções predefinidas.

## Princípios

1. **Ilê Conecta define as regras, a casa escolhe entre opções.**
2. **Velocidade é regra de projeto.** A assistente responde com uma única chamada ao modelo por mensagem.
   - Este documento é para pessoas. O modelo só recebe guias curtos (3 a 6 linhas) dos recursos que a casa realmente tem.
   - A intenção é detectada por código (palavras-chave e estado da conversa), sem chamada extra ao modelo.
   - O servidor consulta agenda, vagas e preço antes da chamada e entrega os dados prontos no prompt.
   - Ferramentas só para ações (reservar vaga, bloquear horário), nunca para informar.
   - Os cenários de teste passam a medir tempo de resposta e tamanho do prompt.
3. **A assistente nunca inventa** preço, vaga, horário, botão ou regra. Sem o dado, passa para a casa.
4. **Comissão da plataforma:** 4% sobre toda transação executada pela plataforma, em qualquer forma de pagamento (Pix, cartão etc.). Exceção: ritual coletivo, 15%.

## Resumo

| Recurso | Quem vende | Comissão | A casa pode desligar a venda? | Campos obrigatórios |
|---|---|---|---|---|
| Ritual coletivo | Assistente, pela plataforma | 15% | Não | nome, vagas, valor, dia, hora, descrição (mín. 20 caracteres) |
| Trabalhos, serviços, rituais não coletivos | Assistente, pela plataforma (padrão) | 4% | Sim (vê os benefícios que perde) | nome, valor, data/hora, modalidade, descrição (mín. 20 caracteres) |
| Jogos | Assistente, só com hora marcada | 4% | Sim | nome, valor, horários, modalidade, descrição (mín. 20 caracteres) |
| Agenda/Calendário | Ninguém: só publicação | n/a | n/a | título, data, hora |
| Área de membros | A casa define; membro paga pela plataforma ou direto à casa | 4% (pela plataforma) | Sim (pagamento direto) | mensalidade e vencimento por membro |
| Catálogo interno | Ninguém: só alimenta a assistente | n/a | n/a | nome, descrição |

## Fluxo de venda (assistente vende)

1. A assistente conversa, identifica a intenção e oferece o que a casa tem disponível: serviço, trabalho, jogo, ritual ou outro.
2. Explica como funciona.
3. Gera o botão de checkout no próprio chat e a pessoa é direcionada ao checkout.
4. A vaga ou o horário fica retido por **15 minutos** esperando o pagamento.
5. O sistema valida a confirmação do pagamento.
6. O sistema confirma a vaga para o cliente e para a casa e bloqueia a vaga (ou o horário da agenda, em serviços, trabalhos, jogos etc.).
7. O sistema sempre avisa os dois lados.

Decisão: o modo "casa aprova antes de cobrar" não entra. A venda é direta; a casa define as regras antes, ao cadastrar.

## Modalidade: presencial ou não

A casa sempre indica a modalidade; a assistente entende e executa conforme as regras da casa.

- **Presencial:** bloqueia a agenda da casa.
- **Online / remoto:** confirmação entre casa e cliente.
- **Não presencial:** a casa sempre precisa executar o comando de **iniciar** e o de **terminar**.

## Prova do trabalho (serviço remoto)

- A casa pode validar o trabalho com o cliente remoto por fotos e vídeos de no máximo 30 segundos, pelo chat.
- O sistema entrega a mídia somente a clientes conectados e vinculados àquele serviço.

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
- A assistente consulta a agenda, vende, reserva e bloqueia o horário e avisa a casa (etapa de ferramentas).

## Agenda

- Só publicação, nunca venda.
- Quando a pessoa quer participar, a assistente passa o interesse para a casa na mesma mensagem, sem perguntar mais nada, e diz que a casa confirma.

## Área de membros

- Interna à casa.
- A casa define mensalidade e vencimento de cada membro.
- O membro paga pela plataforma (4%) ou direto à casa.

## Catálogo interno

- Alimenta apenas a assistente; não é público.

## Planos

| Plano | Assistente | Vende | Descontos |
|---|---|---|---|
| Essencial | Não | n/a | n/a |
| Profissional | 300 respostas/mês | Sim | Não |
| Premium | 3.000 respostas/mês | Sim | Sim, dentro do limite da casa |

## Decisões registradas

- Descrição mínima de rituais e serviços: **20 caracteres**.
- Comissão de **4%** vale para jogos e para toda transação pela plataforma, em qualquer forma de pagamento.
- Retenção de vaga/horário antes do pagamento: **15 minutos**.
- Modo "casa aprova antes de cobrar": **não entra**; vale o fluxo de venda direta acima.

## Perguntas em aberto

1. A comissão de 15% do ritual coletivo continua, como exceção aos 4%?
2. A explicação detalhada de "como funciona" vai antes do pagamento (para decidir) ou depois (instruções)? Pelo seu texto entendi depois do pagamento; confirme.
3. Quando a casa não iniciar ou não terminar um serviço remoto dentro de um prazo, o que acontece (aviso, reembolso)?

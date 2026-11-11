# Regras do Ilê Conecta por recurso

Aprovado pelo dono da plataforma em 01/11/2026. As regras são decisão do Ilê Conecta; as casas escolhem entre opções predefinidas. Este documento pode ser editado no painel admin (seção Documentos).

## Princípios

1. **Ilê Conecta define as regras, a casa escolhe entre opções.**
2. **Velocidade é regra de projeto.** A assistente responde com uma única chamada ao modelo por mensagem.
   - Este documento é para pessoas. O modelo só recebe guias curtos (3 a 6 linhas) dos recursos que a casa realmente tem.
   - A intenção é detectada por código (palavras-chave e estado da conversa), sem chamada extra ao modelo.
   - O servidor consulta agenda, vagas e preço antes da chamada e entrega os dados prontos no prompt.
   - Ferramentas só para ações (reservar vaga, bloquear horário), nunca para informar.
   - Os cenários de teste passam a medir tempo de resposta e tamanho do prompt.
3. **A assistente nunca inventa** preço, vaga, horário, botão ou regra. Sem o dado, passa para a casa.
4. **Comissão da plataforma:** 4% sobre toda transação executada pela plataforma, em qualquer forma de pagamento (Pix, cartão etc.). **Única exceção: ritual coletivo, 15%**, porque nele o sistema faz tudo.

## Resumo

| Recurso | Quem vende | Comissão | A casa pode desligar a venda? | Campos obrigatórios |
|---|---|---|---|---|
| Ritual coletivo | Assistente, pela plataforma | 15% | Não | nome, vagas, valor, dia, hora, descrição (mín. 20 caracteres) |
| Trabalhos, serviços, rituais não coletivos | Assistente, pela plataforma (padrão) | 4% | Sim (vê o que perde) | nome, valor, data/hora, modalidade, descrição (mín. 20 caracteres) |
| Jogos | Assistente, só com hora marcada | 4% | Sim (vê o que perde) | nome, valor, horários, modalidade, descrição (mín. 20 caracteres) |
| Agenda/Calendário | Ninguém: só publicação | n/a | n/a | título, data, hora |
| Área de membros | A casa define; membro paga pela plataforma ou direto à casa | 4% (pela plataforma) | Sim (pagamento direto) | mensalidade e vencimento por membro |
| Catálogo privado | Ninguém: só alimenta a assistente | n/a | n/a | nome, descrição |

## Como a conversa acontece

Vale para ritual coletivo, jogos, serviços, trabalhos e qualquer outro recurso que a casa tenha. A assistente atende como uma pessoa da casa atenderia.

1. **Saudação curta**, perguntando como ajudar.
2. **Intenção:** o cliente diz o que quer (viu a publicação de um ritual, quer saber de jogo de búzios etc.). A assistente confere o que a casa tem.
3. **Apresenta, em poucas linhas e antes do pagamento:** o que é, quando, modalidade (a distância ou presencial), a descrição da casa e o valor. Termina convidando: "você gostaria de participar?"
4. **O cliente aceita:** a assistente informa o valor, pergunta se pode encaminhar para o pagamento e diz que a vaga é confirmada assim que o pagamento for confirmado. Avisa que o cliente será notificado quando a casa iniciar e quando terminar.
5. **Checkout:** a assistente gera o botão no próprio chat e o cliente vai ao checkout.
6. **Espera de 15 minutos.** Sem pagamento, a vaga ou o horário volta a ser vendido.
7. **Pagamento confirmado:** o cliente recebe "parabéns, sua vaga está confirmada, avisaremos assim que iniciar". Casa e cliente são notificados e a vaga (ou o horário da agenda) é bloqueada.

A explicação da conversa vem **antes** do pagamento, para o cliente decidir. Depois do pagamento, vem a confirmação e o aviso de que ele será notificado no início e no fim.

### Jogos (muda pouco)

- O cliente pergunta sobre jogos ou valor. A assistente responde com base no que a casa oferece (ex.: búzios, online ou presencial, R$ 200) e pergunta se quer marcar.
- O cliente diz o dia e o período (ex.: quarta de manhã, presencial).
- A assistente **analisa a agenda da casa** e oferece só os horários livres (ex.: 9h e 10h, porque 8h e 11h estão ocupados).
- O cliente escolhe o horário, a assistente encaminha ao pagamento e segura o horário por 15 minutos.
- Pagamento confirmado: agenda e bloqueia o horário; cliente e casa recebem a confirmação com dia e hora.
- Muitos jogos não têm publicação da casa. Por isso existe o **catálogo privado**: só a assistente o enxerga, nunca o público.

## Modalidade: presencial ou não

A casa sempre indica a modalidade; a assistente entende e executa conforme as regras da casa.

- **Presencial:** bloqueia a agenda da casa.
- **Online / remoto:** confirmação entre casa e cliente.
- **Não presencial:** a casa sempre precisa executar o comando de **iniciar** e o de **terminar** (obrigatório); o cliente é notificado nos dois.

## Atrasos, cancelamento e reembolso

- **Atraso da casa** (não iniciou ou não terminou no prazo): primeiro **aviso**. Não há reembolso automático por atraso.
- **Antes de a casa iniciar:** o cliente pode pedir reembolso e recebe de forma espontânea (automática).
- **Depois de a casa iniciar:** o cliente ainda pode pedir, mas o pedido vai para **análise**. O cliente indica o que aconteceu; o dono da plataforma analisa, com os dados da negociação entre casa e cliente, e decide.

## Prova do trabalho (serviço remoto)

- **Opcional.** É uma ferramenta que a casa pode usar, nunca uma obrigação. Muitas tradições são sigilosas e não expõem o trabalho, e os clientes sabem disso.
- Quando a casa quiser, pode validar o trabalho com o cliente remoto por fotos e vídeos de no máximo 30 segundos, pelo chat.
- O sistema entrega a mídia somente a clientes conectados e vinculados àquele serviço.
- O que é obrigatório é a casa clicar em **iniciar** e **terminar**.

## Ritual coletivo

- Sempre conduzido e vendido pela assistente, pela plataforma. A casa não pode desligar.
- A casa preenche todos os campos; sem eles o ritual não é publicado.
- A assistente cita vagas restantes só quando forem 5 ou menos.
- Reembolso e forma de pagamento são explicados só quando a pessoa decide participar ou pergunta como pagar.

## Trabalhos, serviços, rituais não coletivos e jogos

- Vendidos pela assistente por padrão.
- A casa pode desligar a venda pela plataforma. Ao tentar, recebe um aviso do que perde:
  - vendas ativas 24 horas por dia, 7 dias por semana;
  - risco de perder a venda por estar offline;
  - fechamento em tempo real, sem o cliente esperar retorno;
  - comprovante e registro de cada venda;
  - histórico financeiro e histórico de atendimentos na plataforma;
  - processo de reembolso feito pela plataforma (automático antes de a casa começar);
  - avaliações: só compras pela plataforma podem ser avaliadas;
  - menos conversa para combinar valor e pagamento.
- O cliente vê as vantagens de pagar pela plataforma antes de reservar ou contratar: pagamento registrado com comprovante; reembolso integral se cancelar antes de a casa começar; aviso quando a casa iniciar e terminar; histórico do pedido; só quem comprou pela plataforma avalia a casa.
- Com a venda desligada, a assistente informa nome, valor e modalidade, não indica botão e passa para a casa quando a pessoa quer contratar.

## Passagem da assistente para a casa (0075)

- A assistente é a **primeira camada de atendimento e venda**: responde, explica e vende tudo o que puder e só passa a conversa para a casa quando não há mais o que fazer (data da agenda, serviço sem como contratar, informação que não existe nos textos da casa, reclamação, risco de vida, pedido para falar com a casa).
- Assunto delicado e saúde **não** são repasse automático: a assistente acolhe e conversa a partir do que a casa realiza, sem diagnóstico, sem conselho médico e sem prometer resultado. Em risco de vida, ela indica o CVV (188) e passa para a casa.
- Depois de passar, ela **continua atendendo**: conversa também sobre o assunto passado (sem decidir o que só a casa decide: valor não listado, horário, condição) e atende qualquer outro assunto. Não repete o aviso a cada mensagem.
- Ela só **se cala quando a casa ou a equipe está atendendo** (respondeu ou assumiu). Se a casa sai ou fica parada, a assistente volta (0072).
- Ao voltar, ela lê as mensagens da casa no histórico (até 20 mensagens, as da casa marcadas) e respeita o que foi combinado.
- A casa recebe lembretes enquanto a conversa aguarda: a cada 4 minutos nos 3 primeiros, depois a cada 15 minutos, até 2 horas. Se a assistente passar um novo assunto, a casa é avisada de novo (no mínimo 10 minutos entre avisos).
- Na faixa do chat, a casa pode **Assumir** ou **Devolver** à assistente.

## Agenda única da casa (0073)

- A casa tem **uma só agenda**. Tudo o que tem horário ocupa a agenda; o que não tem horário é só publicação e não bloqueia nada.
- Ritual coletivo com horário: bloqueia pela duração que a casa escolheu (padrão 2 h).
- Gira, obrigação, celebração e festa do calendário **com horário**: bloqueiam **2 h** a partir da hora base (só com o calendário ligado). Sem horário: só publicação.
- Jogo ou serviço com horário marcado: bloqueia o horário contratado. Vale para **qualquer tipo de serviço** e qualquer modalidade (presencial, transmissão, híbrido, com ou sem sigilo).
- Trabalho remoto em andamento ("iniciar → terminar"): o cliente é avisado; o reembolso automático termina quando a casa inicia.

## Serviço privado (0073)

- No cadastro do serviço a casa escolhe **Mostrar na página da casa: sim/não**.
- Privado = não aparece na página nem para outras casas; **só a assistente o vende**, e só quem recebeu a oferta dela no chat consegue ver os horários e contratar (o banco confere a oferta; o cliente não consegue forjá-la).
- A assistente vende, mostra os horários livres da agenda única, cobra no chat, agenda, bloqueia o horário e avisa casa e cliente.
- A casa pode desligar a venda da assistente (menos ritual coletivo) depois de ver o aviso "o que perde" (registros, histórico, vendas mesmo offline).

## Agenda (publicação)

- Só publicação, nunca venda.
- Quando a pessoa quer participar, a assistente passa o interesse para a casa na mesma mensagem, sem perguntar mais nada, e diz que a casa confirma.

## Área de membros

- Interna à casa.
- A casa define mensalidade e vencimento de cada membro.
- O membro paga pela plataforma (4%) ou direto à casa.

## Catálogo privado

- Alimenta apenas a assistente; não aparece para o público.
- Para a assistente **vender** (horário, cobrança, agenda), cadastre como serviço privado.

## Planos

| Plano | Assistente | Vende | Descontos |
|---|---|---|---|
| Essencial | Não | n/a | n/a |
| Profissional | 300 respostas/mês | Sim | Não |
| Premium | 3.000 respostas/mês | Sim | Sim, dentro do limite da casa |

## Decisões registradas

- Descrição mínima de rituais e serviços: **20 caracteres**, obrigatória no formulário e no banco (registros antigos curtos continuam até a casa editar o texto).
- Comissão de **4%** em toda transação pela plataforma, qualquer forma de pagamento; **15%** só no ritual coletivo.
- Retenção de vaga/horário antes do pagamento: **15 minutos**.
- Modo "casa aprova antes de cobrar": **não entra**.
- Explicação antes do pagamento; confirmação depois.
- Atraso: aviso primeiro. Reembolso espontâneo antes de a casa iniciar; depois, análise do dono da plataforma.
- Documentos editáveis pelo painel admin.

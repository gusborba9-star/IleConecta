# Roteiro dos testes de vídeo que faltam (feitos pelo proprietário, com aparelhos reais)

Registrado em 25/11/2026 e ampliado no mesmo dia com o Vídeo 2.0 (testes 3 a 6): uma única rodada cobre tudo. São os passos que a plataforma não consegue provar sozinha, porque exigem pessoas e aparelhos de verdade. O resto do vídeo (criação da sala, convidados, aviso, lembrete, aceite, chat, limite de minutos, fechamento automático) tem teste automático.

## Antes de começar
- Uma casa de teste no plano Plus (ou a casa de teste atual) e 3 contas: a da casa (titular) e dois convidados (contas de cliente de teste).
- Três aparelhos com internet: por exemplo o celular, o computador e um segundo celular ou tablet. Cada um entra com uma conta diferente.
- Provedor: o que estiver como principal no painel (LiveKit ou Daily). Anote qual.
- Não envie senhas nem chaves no chat. Basta dizer "passou" ou descrever o que viu.

## Teste 1: três dispositivos ao mesmo tempo
1. A casa cria uma reunião com os dois convidados escolhidos (opção "convidar membros escolhidos").
2. Os dois convidados devem receber o aviso e ver a reunião em destaque na tela inicial.
3. Na hora, os 3 aparelhos entram. Cada convidado aceita o aviso uma vez só.
4. Confira: todos se veem e se ouvem; o contador de pessoas marca 3; quem fala aparece em destaque; o chat da sala entrega a mensagem nos 3 aparelhos.
5. Um convidado sai e volta na mesma reunião: não deve pedir o aceite de novo.
6. A casa encerra a reunião: os 3 aparelhos voltam para a plataforma.
7. Conferência na plataforma (eu faço): minutos gastos na matriz do Plus batem com a duração e o número de pessoas; nenhum erro novo nos registros.

Resultado esperado: tudo acima sem travar, sem eco forte e sem queda. Se houver eco, travamento ou queda, anote o aparelho, a rede (Wi-Fi ou 4G) e o horário.

## Teste 2: expulsar alguém da videoconferência
1. Com a reunião em andamento e os 3 conectados, a casa abre a lista de participantes e remove o convidado B.
2. Confira no aparelho de B: ele sai da sala na hora e vê o aviso de que foi removido.
3. B tenta voltar pelo mesmo link e pela tela inicial: não deve conseguir entrar.
4. O convidado A e a casa continuam na reunião, sem interrupção.
5. Depois do término, a casa não deve ver B na lista de presentes.
6. Conferência na plataforma (eu faço): o registro da remoção existe, o minuto de B parou de contar na hora da saída e não houve erro nos registros.

Resultado esperado: B sai imediatamente e não volta; os outros não sentem nada.

## Teste 3: coanfitrião e moderador (Vídeo 2.0)
1. A casa marca uma reunião com a caixa **Sala de espera** ligada e convida os dois convidados (A e B).
2. Na linha da reunião, a casa toca em **Equipe** e indica A como **Moderador**.
3. Na hora, A entra direto (sem esperar). B pede para entrar e vê a tela "Sala de espera".
4. A (moderador) vê o botão **Espera** com o número 1, abre, e toca **Liberar** em B. B entra sozinho na sala.
5. Confira: A **não** vê o botão Encerrar; a casa vê.
6. A casa muda A para **Coanfitrião** (Equipe > escolher A > função Coanfitrião > Indicar). A sai e volta à sala: agora vê **Encerrar** e consegue encerrar a reunião.
7. Conferência na plataforma (eu faço): papéis gravados, pedidos de entrada e decisões registrados, sem erro.

## Teste 4: sala de espera em grupo
1. Nova reunião com sala de espera, com os dois convidados.
2. Os dois aparelhos pedem entrada ao mesmo tempo; a casa vê 2 na espera.
3. Teste "Liberar escolhidos" (marque um) e depois "Liberar todos" (o outro). Teste "Negar" numa terceira vez: a pessoa negada vê "A casa não liberou a sua entrada" e não entra.

## Teste 5: atividade ao vivo com ingresso (Stripe de teste)
Pré-requisito (eu faço antes): casa de teste no Plus com recebimento Stripe de teste ativo.
1. A casa cria um **ritual à distância** com preço, poucas vagas e horário próximo, publica e toca em **Abrir sala de vídeo da plataforma**.
2. Um cliente de teste reserva e paga com o cartão de teste do Stripe. Outro cliente reserva e **não paga**.
3. No horário (sala abre 10 min antes): o cliente que **pagou** vê "Entrar na sala de vídeo", pede entrada, a casa libera e ele entra. O que **não pagou** não vê a sala e, se abrir o endereço, é recusado.
4. Reembolse a vaga do cliente que pagou (fluxo de reembolso do ritual): ele perde o acesso à sala.
5. Conferência na plataforma (eu faço): comissão do ritual aplicada, vagas e minutos corretos.

## Teste 6: presença e planilha
1. Depois de uma das reuniões acima, a casa abre **Presença** na linha da reunião (ou em Histórico e presença).
2. Confira: quem entrou, a hora de entrada e saída, os minutos, e quem era esperado e não veio aparece como **Ausente**.
3. Toque em **Baixar planilha** e abra no celular ou computador: colunas em português, acentos corretos.
4. Conferência na plataforma (eu faço): os minutos do relatório batem com o consumo do mês.

## Como me avisar
"Teste 1 passou" ou "Teste 1 falhou: <o que viu>", e o mesmo para os testes 2 a 6. Se algo falhar, eu corrijo, repito a verificação do meu lado e peço só a repetição do trecho que falhou.

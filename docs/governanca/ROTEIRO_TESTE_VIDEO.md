# Roteiro dos dois testes de vídeo que faltam (feitos pelo proprietário, com aparelhos reais)

Registrado em 25/11/2026. São os dois passos que a plataforma não consegue provar sozinha, porque exigem pessoas e aparelhos de verdade. O resto do vídeo (criação da sala, convidados, aviso, lembrete, aceite, chat, limite de minutos, fechamento automático) tem teste automático.

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

## Como me avisar
"Teste 1 passou" ou "Teste 1 falhou: <o que viu>", e o mesmo para o teste 2. Se algo falhar, eu corrijo, repito a verificação do meu lado e peço só a repetição do trecho que falhou.

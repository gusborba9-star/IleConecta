# ILÊ CONECTA — ESPECIFICAÇÃO DO ACEITE DOS TERMOS DE USO

- Status: decisão de produto aprovada para orientar implementação.
- Localização documental: `docs/legal/`.
- Exposição: somente no fluxo de aceite pós-login.
- Regra: um único aceite por conta, sem repetição ordinária.

## 1. Comportamento aprovado

O usuário deve aceitar os Termos de Uso uma única vez após autenticar-se.

Fluxo:
1. Usuário conclui login.
2. Backend consulta o registro de aceite associado à identidade autenticada.
3. Se existir aceite válido, liberar navegação normal conforme permissões.
4. Se não existir, apresentar exclusivamente a etapa de aceite dos Termos.
5. Usuário pode ler a versão apresentada e escolher aceitar ou sair/não prosseguir.
6. Ao aceitar, o backend grava o evento de forma confiável.
7. Somente após confirmação do backend liberar o ambiente autenticado.
8. Em logins futuros, não exibir novamente o aceite se o registro existir.

Não apresentar aceite em cada sessão, em cada dispositivo, ao trocar de rota, ao abrir o painel ou ao iniciar uma contratação.

## 2. O que deve ser exibido

A interface apresenta somente:
- Título “Termos de Uso”.
- Texto integral da versão vigente que precisa ser aceita.
- Identificação da versão/data de vigência.
- Ação explícita “Aceitar e continuar”.
- Ação para sair/não aceitar, sem liberar o ambiente autenticado.

Não adicionar checkboxes de consentimentos opcionais, banners de políticas, links para manuais internos ou listas de regras operacionais nesse fluxo.

A apresentação deve ser objetiva, legível e responsiva. Não inserir o conteúdo de Blueprint, Roadmap, regras financeiras internas, matriz de permissões ou protocolo de execução.

## 3. Regra de unicidade

A unicidade é por identidade de usuário, não por navegador ou dispositivo. Uma conta não deve ser solicitada novamente porque:
- iniciou nova sessão;
- limpou cookies ou armazenamento local;
- trocou de aparelho;
- reinstalou o aplicativo;
- mudou de rota ou ambiente;
- atualizou a aplicação;
- fez logout e login novamente.

O registro persistente no backend evita que a interface local determine se houve aceite.

## 4. Modelo de dados conceitual

O sistema deve manter uma entidade/registro de aceite com, no mínimo:
- user_id vinculado à identidade autenticada;
- terms_document_id ou terms_version imutável;
- document_hash para identificar exatamente o conteúdo aceito;
- accepted_at gerado pelo servidor;
- acceptance_event_id/idempotency key;
- origem/fluxo da ação, se necessário para auditoria.

Restrições:
- no máximo um aceite válido por usuário para a versão que foi apresentada;
- operação idempotente;
- usuário não pode criar aceite para outro usuário;
- cliente não pode editar ou apagar o histórico;
- leitura e escrita protegidas por RLS/backend;
- histórico preservado para auditoria.

O desenho físico deve reutilizar estruturas existentes após auditoria. Não criar tabela, migration ou função sem verificar se já existe mecanismo equivalente.

## 5. Atualização dos Termos

Decisão do proprietário de **2026-11-24** (revoga a de 2026-11-13, que não pedia novo aceite): quando o texto de um documento muda de forma **material**, o aceite **reaparece** para quem já tinha aceitado.

- **Material** (muda direito, dever, cobrança, tratamento de dados, prazo ou finalidade): sobe `LEGAL_VERSION` e `DOC_MIN_VERSION` do documento. Quem aceitou uma versão anterior ao mínimo vê a tela única de aceite, uma vez, com o aviso "os termos foram atualizados", e só segue usando depois de aceitar. Quem nunca aceitou continua vendo a tela.
- **Editorial** (ortografia, formatação, link): sobe só `LEGAL_VERSION`; `DOC_MIN_VERSION` não muda e ninguém é obrigado a aceitar de novo.
- Para ninguém esquecer de decidir, `tests/legal-hash.test.mjs` compara a impressão digital dos textos (aceites, Termos do cliente e da Casa, Privacidade e Taxas) com `tests/fixtures/legal-hash.json`: mudar texto sem registrar a decisão faz a verificação falhar (`node scripts/legal-hash.mjs --write` registra).
- Todos (casas e clientes) também recebem uma notificação no aplicativo, com push, com link para o que mudou, enviada pelo servidor (`platform_announce`), nunca pelo usuário.
- O **aceite explícito** com registro do texto exato, versão, data e IP continua nos momentos de dinheiro: autorização da cobrança automática da casa (`house_auto_authorizations` e `legal_consents`, tipo `cobranca_automatica`) e cada compra do cliente.
- **O servidor também exige a versão mínima** (migrações 0222 e 0223, tabela `legal_min_version`): a compra do cliente (`has_client_terms`) e a venda da casa (`house_accepted_terms`) só passam com aceite na versão mínima vigente do documento. O mínimo do servidor e `DOC_MIN_VERSION` do app são iguais, e um teste confere. Texto que não mudou: um único aceite basta, como o advogado recomenda.

## 6. Falhas e segurança

- Se a consulta do aceite falhar, não presumir que o usuário aceitou.
- Se a gravação falhar, não liberar o acesso como se o aceite estivesse confirmado.
- Em caso de timeout após clique, consultar o estado persistido antes de solicitar nova ação.
- Proteger contra repetição de requisições e duplicidade.
- Não confiar em estado local, parâmetro de URL, localStorage ou resposta controlada pelo cliente.
- Não registrar dados sensíveis desnecessários no evento.
- Registrar versão/hash exatos apresentados ao usuário.

## 7. Não aceitar

Se o usuário não aceitar, não liberar as áreas autenticadas que dependem dos Termos. Permitir sair, encerrar sessão ou retornar ao fluxo público. Não criar ciclos de modal repetido dentro da mesma sessão; a decisão de não aceitar deve encerrar o fluxo autenticado.

## 8. Critérios de aceite técnico

1. Conta sem registro: após login, aparece uma única etapa de aceite.
2. Aceite confirmado: acesso liberado sem repetição.
3. Próximo login: nenhuma solicitação.
4. Outro dispositivo: nenhuma solicitação.
5. Cookies/localStorage limpos: nenhuma solicitação.
6. Logout/login: nenhuma solicitação.
7. Conta diferente: verifica o registro próprio, sem herdar aceite de outra pessoa.
8. Falha de rede na leitura: não presumir aceite.
9. Falha na gravação: não liberar como aceito.
10. Requisições repetidas: um único evento lógico.
11. Atualização editorial do documento: não dispara novo aceite.
12. Versão material (decisão de 2026-11-24): o aceite reaparece uma vez para quem aceitou versão anterior ao mínimo do documento (seção 5).
13. Nenhuma outra política, norma ou manual aparece como tela ou item de navegação.

## 9. Limite desta especificação

Este documento define o comportamento desejado. Não comprova que o fluxo esteja implementado. A implementação atual deve ser auditada e reutilizada. Nenhuma migration, alteração de código ou mudança de produção está autorizada por este documento.

## 10. Estado da implementação (2026-11-11, decisão do proprietário)

- O aceite é feito **uma única vez por conta, na primeira entrada** (não necessariamente no login), em tela exclusiva, com confirmação do servidor antes de liberar o app. A tela só reaparece se o texto mudar de forma material (`DOC_MIN_VERSION`).
- A autorização de dados sobre convicção religiosa fica em caixa separada e opcional na mesma tela; vale até ser retirada, e a retirada é registrada.
- Os termos deixam de aparecer em cada tela e fluxo. O acesso permanente é a página "Termos e normas" (menu lateral, "Mais" e rodapé), para cliente, casa e equipe.
- Detalhes técnicos e regras: `docs/regras-por-recurso.md`, seção "Aceite único dos Termos (0076)".

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

A regra padrão é não solicitar novo aceite após o primeiro registro.

Uma versão posterior não deve automaticamente reabrir a tela. Alteração material deve ser analisada juridicamente. Somente quando a legislação, contrato ou parecer jurídico exigir novo consentimento/aceite, e após aprovação expressa do proprietário, poderá ser criada uma nova exigência. Essa exceção deve ser documentada e limitada ao necessário; nunca usar mudança editorial para forçar aceite recorrente.

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
12. Versão material: não dispara novo aceite automaticamente; exige análise e autorização específica conforme seção 5.
13. Nenhuma outra política, norma ou manual aparece como tela ou item de navegação.

## 9. Limite desta especificação

Este documento define o comportamento desejado. Não comprova que o fluxo esteja implementado. A implementação atual deve ser auditada e reutilizada. Nenhuma migration, alteração de código ou mudança de produção está autorizada por este documento.

# ILÊ CONECTA — MATRIZ DE CAPACIDADES E PERMISSÕES

- Documento subordinado ao Blueprint definitivo.
- Status: modelo de autorização e matriz comercial parcial.
- Não autoriza mudanças de plano, banco ou código.

## 1. Princípio central

A autorização efetiva é a interseção de quatro dimensões independentes:

1. **Plano/capacidade:** o contrato da casa inclui o recurso?
2. **Configuração:** a casa ativou ou desativou o recurso?
3. **Permissão individual:** o membro possui autorização para aquela ação?
4. **Estado/restrição:** assinatura, limite, suspensão, risco ou política administrativa permitem a operação?

A interface deve refletir essas dimensões, mas o backend é a autoridade final. Ocultar um botão não é controle de acesso.

## 2. Papéis de referência

- Visitante: acessa somente conteúdo público.
- Cliente autenticado: acessa seus próprios dados, pedidos, pagamentos, conversas e relações autorizadas.
- Titular da casa: controle integral da organização, plano e configurações.
- Administrador da casa: poderes delegados pelo titular.
- Colaborador: permissões específicas e limitadas.
- Administrador central: funções globais estritamente autorizadas e auditadas.

Papéis não devem ser confundidos com estados de relacionamento. Seguidor, interessado, cliente, participante e mensalista não são papéis administrativos.

## 3. Matriz de domínios e controles

| Domínio | Capacidade da plataforma | Configuração da casa | Permissão individual exigida |
|---|---|---|---|
| Perfil público | Publicação e edição | Campos públicos e visibilidade | Gerir perfil |
| Catálogo | Criar e administrar ofertas | Oferta pública/privada e ativa/inativa | Gerir catálogo |
| Agenda | Gerir disponibilidade | Horários, bloqueios e modalidades | Gerir agenda |
| Rituais | Criar e operar eventos | Dados, vagas e condições | Gerir rituais |
| Assistente | Disponibilidade conforme plano | Atendimento on/off | Configurar assistente |
| Execução comercial IA | Capacidade disponível | Execução on/off, separada do atendimento | Autorizar ações comerciais |
| Atendimento | Conversas e mensagens | Regras de encaminhamento | Visualizar/responder/assumir |
| CRM | Relacionamento e pendências | Segmentação/filtros permitidos | Acessar CRM |
| Equipe | Gestão de membros | Convites e delegações | Gerir equipe |
| Financeiro | Transações e relatórios | Dados bancários e parâmetros permitidos | Visualizar/operar financeiro |
| Divulgação | Campanhas e posicionamento | Compra, público e duração | Gerir divulgação |
| Membros | Vínculos e mensalidades | Regras de associação | Gerir membros |
| Suporte | Ocorrências | Preferências e respostas | Tratar ocorrências |
| Administração central | Controles globais | Não aplicável à casa | Permissão administrativa explícita |

## 4. Permissões granulares mínimas a suportar

- Ver painel e indicadores.
- Ver/editar perfil público.
- Criar/editar/publicar/desativar ofertas.
- Gerir agenda e bloqueios.
- Criar/editar/iniciar/finalizar rituais.
- Ver conversas, responder, assumir e transferir.
- Configurar assistente e seu conhecimento.
- Autorizar execução comercial automatizada.
- Ver/editar registros do CRM.
- Gerir equipe e convites.
- Ver financeiro.
- Solicitar ou executar operações financeiras permitidas.
- Gerir planos e adicionais.
- Gerir divulgação.
- Gerir membros/mensalidades.
- Tratar suporte e ocorrências.
- Gerir avaliações e respostas.
- Consultar auditoria.

Permissões de alto risco (financeiro, titularidade, plano, equipe, exportação de dados e ações administrativas) devem ser separadas e auditadas.

## 5. Planos comerciais aprovados

| Plano | Mensalidade inicial aprovada |
|---|---:|
| Essencial | R$ 89,90 |
| Profissional | R$ 179,90 |
| Premium | R$ 299,90 |

Esses valores são referência comercial aprovada em 02/11/2026. Não inferir que todo recurso do Blueprint está incluído em cada plano.

## 6. Vagas adicionais de equipe

| Plano | Regra aprovada |
|---|---|
| Essencial | R$ 29,90/mês por vaga adicional |
| Profissional | R$ 39,90/mês por vaga adicional |
| Premium | 1 vaga adicional incluída; extras R$ 39,90/mês |

A cobrança e a quantidade de vagas devem ser sincronizadas, sem duplicidade em upgrade/downgrade. A elegibilidade exata da vaga incluída e o tratamento de membros existentes devem ser validados antes da implementação.

## 7. Créditos IA

Pacotes aprovados:
- 80 respostas: R$ 19,90.
- 200 respostas: R$ 49,90.
- 500 respostas: R$ 89,90.

Complementam a franquia mensal nos planos Profissional/Premium conforme decisão comercial registrada. A franquia-base por plano, validade, expiração, acumulação, ordem de consumo, estorno e downgrade/cancelamento permanecem pendentes. Retry técnico, falha e webhook repetido não podem consumir créditos em duplicidade.

## 8. Recursos ainda sem distribuição definitiva

Não atribuir limites por plano sem aprovação:
- Quantidade de ofertas.
- Volume de publicações e alcance.
- Franquia-base de IA.
- Quantidade de campanhas/destaques.
- Relatórios avançados.
- Integrações externas.
- Automação avançada.
- Armazenamento e mídia.
- Quantidade de membros/clientes.
- Recursos de equipe além das vagas comerciais já aprovadas.

## 9. Regras de enforcement

- Verificar permissão no backend em toda operação protegida.
- Aplicar RLS por usuário e organização.
- Não confiar em role, plano ou preço enviado pelo cliente.
- Registrar ator, organização, ação, alvo, data/hora e resultado para operações sensíveis.
- Revogar imediatamente acessos após remoção ou alteração de permissão.
- Separar permissão de leitura, alteração e execução.
- Não conceder acesso por pertencer ao mesmo usuário global.
- Acesso administrativo excepcional deve ter justificativa e trilha de auditoria.

## 10. Regra de interface

Esta matriz é documentação interna. Não criar tela de “normas”, “políticas”, “matriz de permissões” ou lista de regras no aplicativo. A interface apresenta apenas controles operacionais necessários ao contexto da função, sem despejar documentação normativa. O aceite de Termos segue exclusivamente a política em `../legal/README.md`.

## 11. Pendências

A matriz por plano só será considerada definitiva após decisão explícita sobre todos os limites e recursos comercializados. Até lá, usar catálogo central de capacidades e não inventar benefícios ou restrições.

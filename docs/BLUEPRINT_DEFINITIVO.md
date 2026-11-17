# ILÊ CONECTA
# BLUEPRINT DEFINITIVO DO PRODUTO E DA ARQUITETURA

**Documento mestre de produto, negócio, experiência, regras operacionais e arquitetura**

- **Data de consolidação:** 03/11/2026
- **Repositório oficial:** `gusborba9-star/IleConecta`
- **Branch de referência:** `main`
- **Commit-base:** `5463dbd8d32b1ab6acbca9026bc36363ef18ba8c`
- **Status:** consolidado para aprovação formal do proprietário.
- **Escopo desta inclusão:** documentação exclusivamente. Não autoriza alterações de código, banco, migrations, configurações, integrações, deploy ou comportamento em produção.

---

# 0. AUTORIDADE E FINALIDADE

Este é o documento central de definição do Ilê Conecta. Ele estabelece o produto-alvo, suas jornadas, capacidades, regras comerciais, arquitetura-alvo, responsabilidades dos módulos e critérios de qualidade.

Não é uma proposta de funcionalidades desconectadas. É a definição de como o ecossistema deve funcionar como sistema integrado.

## 0.1 Hierarquia oficial

**BLUEPRINT → ROADMAP → EXECUÇÕES → CÓDIGO**

- **Blueprint:** define o que é o produto, como funciona, suas regras, arquitetura-alvo e critérios de qualidade.
- **Roadmap:** organiza fases, dependências, prioridades, lacunas e critérios de conclusão.
- **Execuções:** ordens delimitadas de implementação, correção, auditoria ou validação.
- **Código:** implementação subordinada às especificações aprovadas.

Nenhuma execução pode alterar silenciosamente uma decisão do Blueprint.

## 0.2 Autoridade

- O proprietário aprova visão, prioridades, regras comerciais e mudanças de produto.
- O CTO define arquitetura, especificações, critérios técnicos, prioridades e validações.
- O executor implementa estritamente as ordens aprovadas, sem redesenhar o produto por iniciativa própria.
- O executor deve resolver problemas dentro do escopo autorizado antes de reportar impedimentos, exceto em ordens exclusivamente de auditoria.

## 0.3 Estabilidade documental

Este Blueprint é a referência permanente do produto. Não deve ser reescrito a cada execução.

Correções técnicas, progresso, evidências e estado de implementação pertencem ao Roadmap e aos relatórios de execução.

Alterações no Blueprint somente são necessárias quando houver mudança real de visão, regra de negócio, jornada, capacidade estrutural, modelo comercial, arquitetura-alvo, responsabilidade de módulo ou política de segurança/privacidade. Toda alteração exige motivo, impacto e aprovação. Não criar versões apenas para registrar progresso ou pequenas correções.

---

# 1. IDENTIDADE DO PRODUTO

## 1.1 Definição

O Ilê Conecta é um ecossistema digital de relacionamento, descoberta, atendimento, comercialização e gestão para casas espirituais e seus clientes.

Integra:
- Rede social e comunidade.
- Marketplace especializado.
- Perfis públicos e descoberta.
- Atendimento e conversas.
- Assistente virtual comercial.
- Agenda, reservas e eventos.
- Gestão de clientes e relacionamento (CRM).
- Gestão operacional das casas.
- Gestão de equipe e permissões.
- Pagamentos, financeiro e assinaturas.
- Divulgação, destaque e impulsionamento.
- Suporte, reputação e administração central.

Não deve ser tratado apenas como catálogo de casas, chatbot ou rede social genérica. Seu diferencial está em conectar descoberta, relacionamento, atendimento, contratação, operação e gestão em um único ambiente.

## 1.2 Objetivo central

Permitir que uma pessoa encontre uma casa espiritual, conheça seu trabalho, acompanhe publicações, converse, consulte ofertas, contrate serviços, participe de rituais, acompanhe solicitações e mantenha relacionamento com a casa.

Permitir que a casa divulgue atividades, organize a operação, atenda clientes, automatize processos, venda serviços, gerencie equipe e acompanhe resultados.

## 1.3 Posicionamento

O Ilê Conecta é uma infraestrutura digital especializada para o relacionamento entre casas espirituais e pessoas interessadas em seus serviços e atividades. “Facebook religioso” e “marketplace religioso” descrevem partes do produto, mas não sua totalidade.

---

# 2. PRINCÍPIOS FUNDAMENTAIS

1. **Integração real:** módulos compartilham dados e eventos sem duplicar responsabilidades.
2. **Fonte única de verdade:** cada entidade possui módulo proprietário de seus registros e estados oficiais.
3. **Autonomia da casa:** a casa configura sua operação dentro dos limites da plataforma.
4. **Automação controlada:** ações automatizadas são autorizadas, rastreáveis e auditáveis.
5. **Atendimento humano preservado:** transferência de contexto e continuidade da conversa.
6. **Transparência comercial:** preços, taxas, condições, estados e responsabilidades claros.
7. **Segurança por padrão:** backend é autoridade de autorização e regras críticas.
8. **Privacidade:** dados pessoais e religiosos recebem proteção compatível com sua sensibilidade.
9. **Experiência fluida:** não exigir repetição de informações já disponíveis e autorizadas.
10. **Escalabilidade:** suportar crescimento de casas, usuários, mensagens, pedidos e transações.
11. **Operação mensurável:** ações importantes geram registros e indicadores.
12. **Não simular produção:** dados demonstrativos e operações simuladas são identificados.

---

# 3. ESTRUTURA DO ECOSSISTEMA

O produto possui quatro ambientes integrados.

## 3.1 Ambiente público — descoberta e comunidade

Inclui página inicial, descoberta, busca e filtros, perfis públicos, catálogo, rituais e eventos, publicações, feed, destaques, conteúdos impulsionados, calendário público, informações institucionais e acesso a conversa/contratação.

Visitantes podem conhecer casas e conteúdos públicos sem cadastro indiscriminado. Autenticação é exigida quando a ação depender de identidade, comunicação privada, contratação, pagamento ou dados pessoais.

## 3.2 Ambiente do cliente

Inclui perfil e dados pessoais, preferências e consentimentos, casas seguidas, feed, conversas, pedidos, contratações, participações em rituais, reservas, pagamentos, comprovantes, solicitações de cancelamento/reembolso, notificações, avaliações, histórico, suporte e privacidade.

O cliente deve acompanhar sua relação com cada casa sem procurar informações em áreas desconectadas.

## 3.3 Ambiente da casa — operação e gestão

Inclui painel, perfil público, publicações, catálogo/ofertas, assistente, atendimento, agenda, rituais/eventos, pedidos, clientes/CRM, equipe/permissões, membros/mensalidades, financeiro, divulgação, indicadores e configurações.

## 3.4 Ambiente administrativo central

Inclui gestão de usuários e casas, aprovação/moderação, planos/assinaturas, parâmetros comerciais, comissões, pagamentos/conciliação, reembolsos/ocorrências, documentos, suporte, auditoria, indicadores globais, automações, recursos, campanhas e segurança.

Ações administrativas críticas exigem interface apropriada, autorização, justificativa e trilha de auditoria; não devem depender de alterações manuais no banco para operações comuns.

---

# 4. IDENTIDADE, CONTAS E MULTI-TENANCY

## 4.1 Tipos de conta

Dois perfis principais de utilização: **casa** e **cliente**. Uma pessoa pode relacionar-se com várias casas em papéis diferentes.

## 4.2 Identidade global e relações

A pessoa possui identidade global. Sua relação com cada casa é independente.

O sistema distingue visitante, usuário cadastrado, seguidor, pessoa que iniciou conversa, cliente com contratação, participante de ritual, membro/mensalista, colaborador, administrador da casa, titular e administrador central.

Seguir não significa ser cliente, membro, funcionário ou titular. Compra não cria mensalidade automaticamente.

## 4.3 Isolamento

Cada casa possui contexto operacional isolado. Uma casa não pode acessar clientes privados, conversas, pedidos, dados financeiros, configurações internas ou dados de equipe de outra casa.

A identidade global não elimina o isolamento entre organizações.

---

# 5. MOTOR TRANSVERSAL DE CAPACIDADES

Deve existir modelo central de capacidades. A interface não deve implementar permissões independentes em cada tela.

A disponibilidade considera:
- Plano contratado.
- Recursos incluídos e adicionais.
- Configurações da casa.
- Limites de uso.
- Estado da assinatura.
- Permissões do usuário na casa.
- Restrições administrativas.
- Estado operacional do recurso.

### Três dimensões independentes

- **Disponibilidade:** o plano permite utilizar o recurso?
- **Configuração:** a casa escolheu ativá-lo?
- **Autorização:** o usuário pode executar a ação?

Exemplo: a casa pode possuir assistente no plano e desativá-la; um funcionário pode atender conversas sem poder alterar configurações comerciais.

A validação ocorre na interface para orientar a experiência e no backend como autoridade final, imediatamente antes das operações críticas. Ocultar botões não substitui autorização no servidor.

---

# 6. MOTOR DE EVENTOS E AUTOMAÇÕES

Os módulos comunicam-se por eventos de domínio, por exemplo:
- Nova mensagem ou intenção comercial identificada.
- Interesse encaminhado à casa.
- Reserva temporária criada, confirmada ou expirada.
- Pagamento confirmado.
- Serviço iniciado ou concluído.
- Ritual iniciado ou finalizado.
- Pedido cancelado.
- Reembolso solicitado ou confirmado.
- Novo seguidor ou avaliação.
- Assinatura ou plano alterado.
- Limite atingido.
- Vaga de equipe adicionada ou removida.

Cada evento deve possuir identificador, tipo, origem, entidade relacionada, data/hora, contexto necessário, estado de processamento e política de repetição/idempotência quando aplicável.

Notificações não são fonte oficial de estados financeiros ou operacionais. Pagamentos só são confirmados após validação confiável do provedor pelo backend.

---

# 7. PERFIS PÚBLICOS E DESCOBERTA

## 7.1 Perfil da casa

Pode conter nome, identidade visual, imagens, descrição institucional, localização e abrangência, modalidades, contatos permitidos, publicações, fotos/vídeos, serviços, trabalhos, jogos, rituais/eventos, agenda pública, avaliações elegíveis, canal de atendimento e condições de contratação.

A casa controla as informações públicas, respeitando campos obrigatórios e regras da plataforma.

## 7.2 Descoberta e busca

A descoberta permite filtros por localização, cidade/estado/abrangência, serviço, modalidade presencial/remota, categoria, disponibilidade confiável, relevância e promoção identificada.

A busca contempla casas, ofertas, rituais, eventos e conteúdos. Resultados patrocinados devem ser identificados; posicionamento orgânico não pode ser disfarçado de patrocinado.

---

# 8. CATÁLOGO, OFERTAS E SERVIÇOS

## 8.1 Modalidades

O catálogo contempla trabalhos espirituais, serviços, rituais não coletivos, jogos/consultas, atendimentos com horário, rituais coletivos e outras ofertas autorizadas.

## 8.2 Dados de oferta

Conforme a modalidade: nome, descrição, valor, modalidade, duração, disponibilidade, agenda, vagas, data/horário, requisitos, dados a coletar, condições, cancelamento e informações complementares.

A descrição mínima obrigatória de rituais e serviços é de 20 caracteres, conforme regra registrada.

## 8.3 Catálogo privado

A casa pode cadastrar itens não públicos destinados a orientar a assistente. Não são indexados na descoberta nem exibidos no perfil público; podem ser consultados pela assistente respeitando contexto e permissões.

## 8.4 Responsabilidade

A casa responde pela veracidade das informações, disponibilidade, preço e execução. A plataforma registra a versão das condições aceitas pelo cliente.

---

# 9. AGENDA E DISPONIBILIDADE

A agenda é o núcleo de disponibilidade da casa e contempla horários, bloqueios, reservas, consultas/jogos, atendimentos presenciais/remotos, eventos, compromissos internos, indisponibilidades, duração e intervalos.

Deve existir uma fonte única de disponibilidade para painel, assistente e checkout. Publicar atividade no calendário não significa venda automática. Jogos com horário marcado consultam disponibilidade real. Atendimento presencial confirmado bloqueia o horário correspondente.

O backend impede duas confirmações para o mesmo horário por validação transacional no momento da reserva, não apenas na apresentação de horários livres.

---

# 10. RITUAIS COLETIVOS

Rituais coletivos são modalidade especial.

## 10.1 Fluxo interno obrigatório

A venda ocorre obrigatoriamente pelo fluxo interno da plataforma, conduzido pela assistente. A casa não pode desativar essa modalidade nem substituí-la por contratação externa.

## 10.2 Cadastro e capacidade

A casa informa nome, descrição, valor, vagas, data, horário, modalidade, dados necessários e condições. Campos obrigatórios são validados antes da publicação.

Cada pagamento confirmado ocupa uma vaga. Reserva temporária não é participação definitiva. Capacidade deve ser controlada transacionalmente. Quando todas as vagas forem preenchidas, o ritual fica esgotado. Caso contrário, novas participações encerram uma hora antes do início. A assistente só menciona quantidade de vagas restantes quando houver cinco ou menos.

## 10.3 Comunicação e execução

Antes do pagamento, informar natureza, data, horário, modalidade, valor e condições. Após confirmação financeira, enviar confirmação e informações de acompanhamento.

A casa registra início e término; participantes são notificados. Histórico preserva participantes, pagamentos, horários, estado, notificações e ocorrências.

---

# 11. ASSISTENTE VIRTUAL DA CASA

A assistente é capacidade central, não chatbot isolado. Cada casa possui assistente configurável, limitada às informações e ações autorizadas.

## 11.1 Funções

Responder dúvidas, apresentar ofertas, consultar disponibilidade, identificar intenção, orientar contratação, executar ações autorizadas, criar checkout, acompanhar contratações, encaminhar interesse e preservar contexto humano.

## 11.2 Três modalidades de operação

**A. Assistente completa:** atende, identifica intenção, apresenta ofertas, conduz contratação, gera checkout e executa ações comerciais autorizadas.

**B. Atendimento automatizado com encaminhamento humano:** continua respondendo e apresentando ofertas, mas não conclui venda ou agendamento. Ao identificar intenção, informa que encaminhará o interesse, registra a intenção, notifica a casa, cria pendência, preserva contexto e permite que a equipe assuma a mesma conversa.

**C. Assistente desativada:** atendimento manual pela casa/equipe.

## 11.3 Controles independentes

A casa controla separadamente:
1. Atendimento automatizado ligado/desligado.
2. Execução de vendas/agendamentos pela assistente ligada/desligada.

Desativar execução comercial não desativa atendimento automático. Desativar assistente não desativa automaticamente pagamento interno. A casa recebe explicação objetiva das capacidades que deixa de utilizar, sem linguagem coercitiva.

**Exceção:** rituais coletivos permanecem obrigatoriamente no fluxo interno, independentemente do modo escolhido.

## 11.4 Conhecimento, segurança e eficiência

A assistente não inventa preços, horários, vagas, regras, ofertas ou ações executadas. Usa catálogo, agenda, pedidos e configurações atualizadas. Sem informação confiável, encaminha à equipe.

A arquitetura deve priorizar detecção de intenção por código quando possível, dados estruturados, contexto curto e relevante, uma chamada ao modelo por mensagem quando compatível com qualidade e segurança, ferramentas apenas para ações que alteram estado e avaliação contínua de latência, custo e qualidade. Modelo e fornecedor devem ser substituíveis.

## 11.5 Coleta de dados

A casa define por oferta os campos necessários, como nome, nome completo, idade quando justificada, modalidade e campos personalizados. Formulário é dinâmico e vinculado à oferta. Evitar coleta excessiva; informações que revelem convicção ou prática religiosa exigem atenção especial à LGPD e à necessidade da coleta.

---

# 12. CHECKOUT CONVERSACIONAL E RESERVAS TEMPORÁRIAS

## 12.1 Fluxo

1. Cliente demonstra intenção.
2. Assistente consulta oferta, preço e disponibilidade.
3. Cliente aceita prosseguir.
4. Backend cria reserva temporária de 15 minutos quando há vaga/horário.
5. Checkout é apresentado.
6. Cliente paga.
7. Provedor confirma por evento confiável.
8. Backend valida confirmação e idempotência.
9. Reserva temporária é convertida em definitiva.
10. Cliente e casa são notificados.

## 12.2 Expiração

Sem confirmação no prazo de 15 minutos, a reserva expira, a capacidade é liberada e a interface atualiza o estado. Cliente é informado de que a reserva não foi confirmada.

## 12.3 Casos críticos

Tratar webhook duplicado/atrasado, pagamento confirmado após expiração, falha de provedor, concorrência pela última vaga, pagamento repetido, reserva cancelada, reembolso e divergência entre provedor e banco.

Confirmação visual do navegador não é confirmação financeira. Backend e registro validado do provedor são autoridades.

Trabalhos sem vaga ou agenda não bloqueiam horários. Reserva temporária só existe quando há capacidade escassa a proteger.

**Proposta de horário pelo chat (decisão do proprietário, 15/11/2026, opção A; migration 0118).** Quem fecha por telefone ou conversa não precisa ser preso a uma agenda pública. A casa combina o horário com o cliente no chat e envia uma **proposta** (serviço + dia e hora). Antes de enviar, a plataforma confere a agenda global da casa (pedidos, rituais com duração, bloqueios e datas do calendário com hora) e avisa se o horário está ocupado; a casa pode abrir a agenda do dia antes. O cliente recebe no chat um cartão "Serviço · dia e hora · valor — Confirmar e pagar" que abre o pagamento normal da plataforma (mesmos termos, mesmo reembolso integral até a casa iniciar). Regras: a proposta **não reserva** o horário; vale 24 horas; a casa (ou o cliente, ao recusar) pode cancelá-la; uma nova proposta do mesmo serviço ao mesmo cliente substitui a anterior; a vaga só é reservada quando o cliente toca em pagar (reserva de 15 minutos de sempre) e, se o pagamento for abandonado, o cartão continua válido até vencer; se o horário for tomado entre a proposta e o pagamento, o cliente é avisado ("esse horário não está mais disponível") e a casa é notificada para propor outro; se o valor do serviço mudar depois da proposta, ela é cancelada e a casa notificada. Serviço privado (não listado) pode ser contratado por quem recebeu proposta aberta. No lugar de "Fale com a casa", o cliente vê "Pedir horário à casa", que abre o chat com a mensagem pronta citando o serviço. Proposta feita só pelo dono da casa (limite de 30 por dia); equipe ainda não envia.
- **Aviso da administração (15/11/2026; migration 0122):** o painel tem o card "Enviar aviso": notificação de 10 a 400 caracteres, para todos, só casas, só clientes ou até 200 pessoas escolhidas por busca, com link interno opcional, prévia com a contagem, confirmação, sem repetir o mesmo texto para quem já recebeu e histórico dos envios. Só a administração usa.
- **Moderação, fase 2 (decisão do proprietário e do advogado, 15/11/2026; migration 0121):** promessas garantidas **não são recusadas**: o banco sinaliza (serviços, rituais e publicações, em todos os planos) e abre um registro na **fila da administração**. Fluxo: **orientação educativa** (durante os **30 dias de adaptação**, que começam quando a administração aciona "Iniciar período de adaptação", no dia do aviso geral) → **advertência oficial com prazo de 72 horas** (15 dias para conteúdo antigo com contato externo) → sem correção, **só aquele anúncio é ocultado** até o ajuste (a casa, o restante dos anúncios e os pedidos em andamento não são afetados) → a casa pode **contestar uma vez, em até 7 dias corridos** da advertência (o prazo fica suspenso durante a análise; a administração aceita ou mantém). Corrigir o texto encerra o registro e reexibe o anúncio sozinho. A casa acompanha tudo em **Avisos de moderação** (`/moderacao`) e por notificação curta. Nunca olha o chat; sem página de "dicas de como anunciar". Cláusula "Moderação, advertências e contestação" nos Termos da casa (LEGAL_VERSION 2026-11-rascunho-5) e página pública `/sobre/novidades-seguranca` com o aviso geral. **Limite conhecido:** ocultação vale para serviços, rituais e publicações; nome, apresentação e ofertas da casa não têm ocultação por item (o contato externo nesses campos já é barrado no ato no plano Grátis).
- **Moderação, fase 1 (decisão do proprietário e orientação do advogado, 15/11/2026; migration 0120):** no **plano Grátis**, contato externo (telefone, link, e-mail, @ de rede social) é **recusado na hora, no banco**, com o aviso "No Plano Grátis, a divulgação de contatos externos e links não é permitida. Utilize o chat da plataforma para atender seus clientes.", em todo conteúdo público da casa (nome, ofertas, bio, títulos e descrições de serviços e rituais, publicações e comentários da casa). O chat fica de fora. **Planos pagos não têm a regra** (quem migra para plano pago já o faz para usar a assistente). Conteúdo já publicado não é apagado. **Promessas garantidas** não são recusadas: vão para a administração (fase 2), com 30 dias de adaptação, advertência, prazo de correção e contestação em 7 dias. **Ritual coletivo é sempre vendido pela plataforma e a assistente sempre oferece o pagamento dele**, mesmo com a venda da assistente desligada (já garantido no código e em teste). **Decisão do proprietário (15/11/2026):** o interruptor de venda (`assistants.can_sell`) desliga só a venda **pela assistente**; serviços e rituais continuam sendo vendidos pela página da casa, e o ritual coletivo é sempre vendido pela plataforma. Onde este documento diz "desligar a venda pela plataforma", leia "desligar a venda pela assistente".
- **Textos jurídicos (revisão do advogado, 15/11/2026):** Termos da casa e do cliente ganharam o parágrafo de propostas de horário; o item (e) de destaque e impulsionamento cobre feed, tela inicial e publicações; o Plano Grátis diz que a administração notifica a casa e pode aplicar advertência, suspensão ou exclusão; a Política de Privacidade passou a ter "Métricas de visualização e impulsionamento" (legítimo interesse, registro bruto apagado a cada 24 horas).
- **Divergência registrada:** o serviço presencial sem "Agendar horário pela plataforma" não tinha botão de contratar (§ planos). Com a proposta, ele passa a poder ser contratado quando é a casa quem escolhe o horário; a contratação direta continua bloqueada. **Confirmado pelo proprietário em 15/11/2026.**

---

# 13. ATENDIMENTO, CONVERSAS E HANDOFF

Cada conversa mantém participantes, casa, mensagens, anexos autorizados, leitura, histórico, origem, contexto comercial e responsável atual.

No handoff, histórico não é apagado nem duplicado; intenção é registrada; casa recebe notificação; cliente sabe que equipe assumirá; CRM recebe pendência; atendente continua no mesmo canal.

A casa pode assumir, responder, transferir responsabilidade, encerrar e retomar automação quando permitido. Automação não disputa conversa com atendente humano.

Arquivos e mídias respeitam autorização, vínculo e finalidade. Provas opcionais de serviços remotos podem ser fotos e vídeos de até 30 segundos quando a casa escolher utilizar o recurso. Prova não é obrigatória; sigilo deve ser respeitado.

---

# 14. CRM E RELACIONAMENTO

CRM é visão integrada do relacionamento, não lista de contatos.

A pessoa é identidade global; a relação com cada casa é isolada. Distinguir seguidor, interessado, pessoa que conversou, cliente, cliente recorrente, membro/mensalista, participante, pessoa com pendência/ocorrência e colaborador.

A timeline referencia eventos originais: conversas, intenções, pedidos, pagamentos, reservas, participações, avaliações, mensalidades, ocorrências e tarefas. Não duplica registros oficiais.

Central de pendências consolida conversas sem resposta, interesses encaminhados, pedidos, reservas, pagamentos, reembolsos, eventos, mensalidades, ocorrências e tarefas.

- **Central de pendências da administração (construída em 16/11/2026, migration 0129):** só leitura, sem tabela nova; junta suporte, moderação, denúncias de conversa, avaliações contestadas, exclusão de conta, reembolsos (cliente e plataforma), cobranças sem confirmação e pedidos presos em reembolso, vencidos primeiro, com atalho para onde se resolve. Chamados que esperam outra pessoa não entram. Os prazos padrão ficam em `pending_deadline_hours`. A visão da casa foi construída na sequência (migration 0130): uma só para titular e equipe, filtrada no banco pela casa e pela permissão, mostrando só o que a casa usa (conversas sem resposta, assuntos passados pela assistente, pedidos, mensalidades, reembolsos, avaliações, moderação, suporte, faturas, cadastro e créditos da assistente, inclusive no Grátis com pacote de créditos), mais o bloco "A pagar à plataforma" com valores e vencimentos. A equipe nunca vê cobrança, reembolso, avaliações, moderação, suporte nem cadastro. Prazos padrão em `house_pending_hours`. A contestação de avaliação pode ser encerrada pela administração sem esconder a avaliação, e a casa não contesta de novo a mesma avaliação.

Segmentação respeita consentimento, finalidade e restrições de dados sensíveis. Funil comercial é ferramenta de análise e não substitui estados oficiais.

- **Pessoas da casa (construído em 16/11/2026, migration 0131):** só leitura, sem tabela nova. Lista as pessoas que têm relação real com a casa (seguem, conversaram, pediram, reservaram ou são membros com conta) com os segmentos seguidor, conversou, interessado, cliente, recorrente, participante, membro, com pendência e sem contato há 90 dias, e abre a linha do tempo de cada uma, que referencia os registros originais (nunca o texto de mensagens). A titular vê tudo; a equipe vê só o que a permissão libera e nunca valores, avaliações nem reembolsos. Avaliação anônima não liga à pessoa, pessoa bloqueada não aparece e quem não tem relação com a casa não abre linha do tempo. Segmentos servem para atender e acompanhar; não há exportação nem envio em massa.

---

# 15. EQUIPE E PERMISSÕES

A casa possui titular, administradores e colaboradores.

O sistema deve permitir convite, aceite, recusa, revogação, remoção, alteração de permissões e consulta do histórico.

Permissões granulares incluem visualizar/responder conversas, assumir atendimento, visualizar/gerenciar pedidos, publicar, editar ofertas, gerenciar agenda, membros, indicadores, financeiro, equipe e configurações.

Titular mantém autoridade superior e não pode ser removido por colaborador comum.

Toda operação valida identidade, vínculo com casa, permissão específica, estado da casa, capacidade do plano e autorização no backend. Alterações relevantes geram auditoria.

---

# 16. REDE SOCIAL E COMUNIDADE

Feed contempla publicações de casas, fotos/vídeos, textos, conteúdo informativo, atividades, eventos e conteúdo impulsionado identificado.

Interações, conforme configuração e moderação: curtir, comentar, compartilhar, salvar, seguir casa, abrir perfil e iniciar conversa.

Conteúdos temporários devem respeitar privacidade, moderação, direitos de imagem, regras de publicação e expiração/retensão de mídia.

A plataforma oferece denúncia, bloqueio, remoção, registro de ocorrência, revisão administrativa e regras contra fraude, assédio e conteúdo ilícito.

---

# 17. DESTAQUE E IMPULSIONAMENTO

**Situação (15/11/2026):** em produção (migration 0114 aplicada pelos passos 221–233; rotina `promotions-tick` a cada 15 minutos; compra e reembolso pela função `platform-billing`). Validação ponta a ponta no modo teste do Stripe em andamento.

São produtos distintos (decisão do proprietário, 14/11/2026). Em 15/11/2026 o impulsionamento passou a incluir também **publicações** da casa (mesmas regras de preço, tempo e reembolso).

- **Destaque:** a casa inteira (página e descrição) aparece primeiro nas buscas, por **cidade, estado ou país**. Há número máximo de casas em destaque ao mesmo tempo em cada alcance (**3 por cidade, 6 por estado, 15 por país**, editável no admin com motivo e auditoria). Quando lota, a compra é bloqueada com aviso e a casa pode entrar na **lista de espera** (é avisada quando abre vaga). Os destaques ativos se revezam nas primeiras posições (busca, rituais e **tela inicial**: bloco "Casas em destaque" com até 3 casas sorteadas a cada visita, mesmo que a casa não tenha publicado nada, mais os serviços impulsionados).
- **Impulsionamento:** leva **um serviço, ritual ou publicação** da casa a mais gente na cidade, no estado ou no país. Cada item tem o seu próprio impulso. Sem limite de vagas na primeira versão. Só serviço ativo e listado, ou ritual publicado que ainda vai acontecer (o impulso termina antes do ritual). Publicação: qualquer publicação da casa (exceto momentos/stories) que ainda exista; no feed, até 3 impulsionadas entram intercaladas, com o selo "Promovido".

**Tempo e cobrança.** Valor por dia (tabela `pricing`, editável no admin; o servidor calcula, a tela só mostra). Seletor livre de 1 a 90 dias com atalhos 3, 7 e 20. O relógio começa na **entrega** (pagamento validado) e cada dia é um **bloco de 24 horas** contado dali; o 1º dia já conta como usado. Nova compra do **mesmo item e alcance** soma os dias ao final (entra quando a anterior termina); itens ou alcances diferentes são compras independentes. A compra exige a caixa **"Autorizo o início imediato…"** (carimbada no banco).

**Reembolso (até 7 dias do pagamento).** Devolve (valor pago ÷ dias) × dias que **ainda não começaram**, sem descontar a tarifa do provedor (a plataforma absorve). O dia em andamento continua até o fim do bloco. Nada iniciado = valor integral. Pedido só em "Pedidos e validações" (nada na tela de compra, por orientação do advogado); o texto está nos Termos (Pagamentos e reembolsos, itens e–g). Se a vaga acabar enquanto o pagamento é confirmado, o valor é devolvido integralmente de forma automática.

**Suspensão.** Falta de pagamento pausa o relógio (e o destaque some); regularizar faz o tempo restante voltar a correr.

**Comunicação.** Toda promoção é identificada ("Promovido" / "Em destaque"). Cada casa vê o fim exato ("termina em dd/mm às hh:mm"), os dias restantes e um contador na tela principal e nas telas de compra. Aviso 1 dia antes do fim, com renovação que soma dias. Botão "Impulsionar" em cada serviço, ritual e publicação. **Resultados por compra** (visível só à casa, em "Em andamento"): quantas pessoas viram (metade do item na tela) e quantas abriram; cada pessoa conta uma vez por dia por compra, a própria casa não conta, só vale o que está no ar para quem vê. O banco guarda apenas o total diário (`promo_stats`); o registro de quem viu (`promo_events`) serve só para não contar duas vezes e é apagado no dia seguinte. Nenhum outro usuário lê essas tabelas.

---

# 18. PLANOS, ASSINATURAS E MONETIZAÇÃO

## 18.1 Planos

| Plano | Mensalidade |
|---|---:|
| Grátis | R$ 0 |
| Essencial | R$ 89,90 |
| Profissional | R$ 179,90 |
| Premium | R$ 299,90 |

Direcionamento (matriz aprovada pelo proprietário em 14/11/2026; os números vivem em `platform_settings.plan_matrix` e são editáveis no painel):
- **Grátis (plano de entrada, `houses.plan = 'gratis'`):** todo cadastro de casa começa aqui. Limites: 3 serviços ativos, 2 rituais ativos, 8 publicações por mês. Sem franquia de assistente (só responde com pacote de mensagens comprado), 0 respostas rápidas, 0 links de campanha, 0 vagas de equipe, chat só com texto. **Vende somente pela plataforma** (não pode desligar) e precisa conectar a conta de recebimento antes de publicar serviço ou ritual com valor (trava no banco). Pagamento ou combinação por fora é avaliado pela administração e pode levar à suspensão ou exclusão da conta; quem quer outros meios assina um plano pago. Pode comprar pacotes de mensagens (R$ 19,90 / 49,90 / 89,90), ativar a assistente e comprar destaque e impulsionamento (venda dessas duas ferramentas é a próxima etapa).
- **Essencial (`base`):** assistente com 100 respostas por mês e venda pela assistente; 3 respostas rápidas; chat com texto e PDF; sem limite de serviços, rituais e publicações.
- **Profissional (`intermediario`):** assistente com 500 respostas por mês; 10 respostas rápidas; 2 links de campanha (1 estilo de cartão).
- **Premium (`maximo`):** assistente com 1.700 respostas por mês e desconto autorizado pela casa; 50 respostas rápidas; 30 links de campanha; 1 vaga de equipe inclusa; agenda completa, área de membros, vídeo no ritual e mídia no chat.
- **Reembolso de 7 dias só nos Termos (orientação do advogado, 14/11/2026):** a lei (CDC e Decreto 7.962/13) exige respeitar o prazo e informar como pedir o cancelamento no app, não estampar o aviso na compra. Por isso o reembolso de 7 dias deixa de aparecer nas telas de pagamento do plano, de reativação e de compra de créditos; fica nos Termos de Uso e em Pedidos e validações (onde está o botão, ativo só nos 7 dias), além do aviso de como cancelar em Planos.
- **Serviço presencial no Grátis (14/11/2026):** como o serviço presencial sem "Agendar horário pela plataforma" fica sem botão de contratar (a venda sairia da plataforma), no Grátis o agendamento é obrigatório e a caixa fica travada, com o texto explicando; o banco recusa também (migration 0113). Nos planos pagos a caixa continua livre. Serviços não presenciais seguem pela plataforma mesmo sem agenda.
- **Tela principal da casa (14/11/2026):** as ferramentas de plano acima do atual continuam visíveis, com selo discreto do plano que as inclui (Essencial, Profissional ou Premium, lido da matriz); Membros e Equipe vêm no Premium, Divulgação no Profissional. Link e QR code da casa estão incluídos em todos os planos (descrito no card do Grátis). No Grátis, a conta de recebimento é ativada na própria tela principal e, sem ela, publicar serviço, ritual ou ritual com valor mostra "Ative sua conta de pagamento primeiro". Acessos de equipe: o plano sem acesso incluso é levado a Planos (não ao suporte). Tocar numa ferramenta com selo abre um aviso curto (o que faz, a partir de qual plano, "Ver planos" e "Ver como funciona"). A página Planos tem a tabela "Compare os planos" (ferramentas nas linhas, quatro planos nas colunas, plano da casa destacado), lida da matriz.
- **Venda pela plataforma:** nos planos pagos a venda pela assistente começa ligada e a casa pode desligá-la (aparece a lista do que ela perde; a venda pela página da casa continua); nos pagos a plataforma não cobra taxa de transação, vive da mensalidade. Rituais coletivos são sempre vendidos pela plataforma, em qualquer plano.
- **Cancelamento e reembolso de 7 dias (decisão de 14/11/2026):** a casa que cancela (agora ou no vencimento) ou conclui o reembolso volta ao plano **Grátis**, e não a "Conta inativa". Falta de pagamento continua levando à suspensão e ao bloqueio.
- **Vantagens de pagar pela plataforma** são mostradas ao cliente (reembolso antes de a casa começar, comprovante e histórico, só quem comprou avalia, relato de problema pelo Suporte, pagamento por fora sem suporte) e à casa (lista do que perde ao vender por fora).
- **Destaque e impulsionamento:** ver §17 (construído na etapa de 14/11/2026).

A matriz exata de recursos e limites deve ser central. Módulos não criam regras próprias de plano.

## 18.2 Equipe adicional

| Plano | Regra |
|---|---|
| Essencial | R$ 29,90/mês por vaga adicional |
| Profissional | R$ 39,90/mês por vaga adicional |
| Premium | 1 vaga adicional incluída; extras R$ 39,90/mês |

Cobrança e vagas permanecem sincronizadas. Upgrades, downgrades e cancelamentos não podem gerar vagas duplicadas ou cobranças indevidas.

**Contratação no app (decisões do proprietário, 15/11/2026; migration 0125):** todos os planos pagos (Essencial, Profissional e Premium) compram vaga extra em Equipe, no cartão "Vagas de equipe". Paga-se na hora só o valor proporcional aos dias que faltam até a renovação (Pix ou cartão); a vaga é liberada somente quando o pagamento é confirmado e entra na fatura mensal de vagas a partir da renovação seguinte. A fatura da vaga é pedida pela própria casa na hora: sem lembretes, sem cartão automático e nunca vira atraso. Fica indisponível com fatura em atraso, pagamento em processamento, reembolso do plano em andamento, assinatura cancelada, redução de vagas agendada, fatura mensal de vagas da próxima renovação já gerada, ou valor proporcional abaixo do mínimo (R$ 1,00). Limite de 20 vagas extras. **Reduzir:** a vaga continua até o fim do ciclo pago e some da fatura seguinte, sem devolução; só dá para reduzir se a equipe em uso couber; a casa pode desfazer até a fatura seguinte ser gerada. **Arrependimento de 7 dias na PRIMEIRA contratação da vaga extra (decisão do proprietário, 16/11/2026, conforme parecer do advogado; migration 0128):** a casa pode pedir só em Pedidos e validações (sem aviso na tela de compra da vaga, como nas demais compras, por orientação do advogado de 14/11; o texto fica nos Termos), em até 7 dias do pagamento da contratação, o reembolso integral (a plataforma absorve a tarifa); ao concluir o estorno a vaga é retirada na hora. Vale só para o pagamento da contratação (fatura `upgrade:seat:`), uma vez por cobrança; as renovações mensais da vaga não têm arrependimento. O pedido é barrado se a equipe em uso não couber sem essa vaga, ou se a fatura mensal de vagas emitida depois da compra já está paga ou em pagamento (orientar ao suporte); fatura mensal aberta emitida depois da compra é refeita sem a vaga (chave `...:rN`). A redução agendada é ajustada. O reembolso do plano (primeiro pagamento) continua separado e à parte. Vaga estornada pelo provedor por conta própria (contestação/chargeback) não some sozinha: fica registrada para a administração decidir, e os Termos preveem a suspensão da vaga correspondente até a regularização. A rotina mensal não cobra vaga de ciclo já passado. Divergência resolvida: a decisão de 14/11 (acesso de equipe só a partir do Premium) vale para as vagas incluídas; as extras são compradas por todos os planos pagos (tabela acima).

## 18.3 Créditos de IA

| Pacote | Respostas | Preço |
|---|---:|---:|
| Pequeno | 80 | R$ 19,90 |
| Médio | 200 | R$ 49,90 |
| Grande | 500 | R$ 89,90 |

Complementam franquia mensal. Falhas e retries técnicos não consomem créditos duplicados.

Regras aprovadas em 12/11/2026 (registro em §33.1):
- **Franquia mensal:** 300 respostas no Profissional e 3.000 no Premium. Não acumula de um mês para o outro.
- **Validade do pacote:** 3 meses a partir da compra; depois, o saldo restante zera.
- **Ordem de consumo:** primeiro a franquia mensal; depois os créditos comprados, do pacote mais antigo para o mais novo.
- **Reembolso em até 7 dias (decisão do proprietário, 2026-11-13, orientação do advogado):** a casa pode desistir da compra em até 7 dias após o pagamento. Pacote sem uso: devolução integral. Pacote com uso parcial: devolve o valor proporcional às respostas ainda não usadas (valor pago × restantes ÷ total, em centavos, meio centavo para cima); a franquia do mês é gasta primeiro. A plataforma absorve a tarifa do provedor (não é descontada da casa). O estorno volta pelo mesmo meio de pagamento; o saldo do pacote é retirado ao pedir e devolvido se o provedor recusar. Depois de 7 dias, sem devolução.
- **Débito único por resposta**, mesmo com retries técnicos.
- **Avisos** ao atingir 80% e 100% da franquia mensal.
- **Compra instantânea** pela cobrança da plataforma (§18.5). Só entra à venda depois destas regras implementadas e testadas.
- Em downgrade ou cancelamento, os créditos comprados continuam valendo até o vencimento do próprio pacote, mas só são usados se o plano vigente incluir a assistente.

## 18.4 Outras receitas

Comissões, assinaturas, vagas adicionais, créditos de IA, destaques, impulsionamentos e outros serviços aprovados.

## 18.5 Cobrança da plataforma às casas e inadimplência

Aprovado em 12/11/2026 (registro em §33.1). Vale para planos, vagas adicionais, destaque, impulsionamento e créditos de IA.

- **Meios:** cartão, cartão recorrente e Pix avulso. O sistema emite mensalmente a cobrança (boleto ou QR code Pix, conforme o provedor), com aviso mínimo de 3 dias antes do vencimento (prazo configurável no painel). **Desconto de pontualidade no Pix (15/11/2026; migration 0123):** opcional, desligado por padrão, ligado no painel (decisão: 5%, janela de 7 dias a partir da emissão da fatura, termina na véspera do vencimento). O Pix tem sessão própria com o valor reduzido; o cartão cobra o valor cheio. Não aparece para casa com cartão automático ativo. Texto nos Termos pendente de confirmação do advogado.
- **Calendário próprio:** o calendário de cobranças, os avisos e a tolerância ficam no banco da plataforma. O provedor só processa o pagamento.
- **Avisos escalonados:** fatura disponível; véspera e dia do vencimento; durante a tolerância ("pague e evite a suspensão").
- **Tolerância:** 3 dias úteis após o vencimento. Sem multa nem juros. Não há suspensão enquanto houver pagamento em processamento.
- **Suspensão automática e parcial:** a casa só conclui o que já estava em andamento. Não pode fazer novas vendas ou reservas pela plataforma nem iniciar campanhas. Destaques e impulsionamentos ficam pausados. Mantém acesso aos próprios dados. Reverte automaticamente com o pagamento.
- **Bloqueio total e conta inativa: tela única (aprovado em 13/11/2026, substitui o "painel só para consulta"):** passado o prazo da suspensão parcial, a casa entra em bloqueio total (fora da vitrine e do feed). Quem faz login vê uma única tela, sem menu: "Conta bloqueada" (falta de pagamento: só o fluxo de pagar a pendência e desbloquear) ou "Conta inativa" (assinatura cancelada ou reembolsada: só o fluxo de escolher um plano e pagar). Os dois casos nunca se misturam na visão da casa. Também ficam abertos o suporte (chat da Conecta, que leva o caso à administração), "Baixar meus dados" e os Termos. A equipe da casa vê o aviso sem poder pagar. O servidor também recusa qualquer gravação da casa nesse estado (publicações, serviços, campanhas, equipe etc.). **Vitrine (decisão de 13/11/2026, opção A; migration 0104):** a casa em bloqueio total ou inativa some da descoberta, da busca e do feed (casas, publicações, stories, serviços, eventos e impulsionamentos) por regra de leitura no servidor, e o link direto mostra "Casa indisponível". Continuam vendo a casa a dona, a equipe, a administração e o cliente com pedido em andamento (serviço confirmado/em andamento/reembolso pendente ou reserva de ritual confirmada que ainda não passou), só para concluir o que já contratou. Concluído o pedido, o cliente também deixa de ver a casa. Nada novo com a casa escondida, nem para esse cliente: reserva, fila de espera, pedido de serviço, seguir e abrir conversa nova são recusados (conversa já existente, a dona falando com a administração e a administração chamando a dona seguem). A suspensão parcial não esconde a casa. Antes da migration 0104 esta regra constava no Blueprint e nas telas, mas não existia no banco. O bloqueio parcial segue como está, com aviso fixo. Pagou, a casa volta sozinha.
- **Cancelamento da assinatura pela casa (aprovado em 13/11/2026):** a casa cancela quando quiser, sem multa, em Planos: "Quer mesmo prosseguir?" e depois "Usar até o vencimento" (no dia da renovação a casa fica inativa e não há nova cobrança; até lá pode desfazer; recomendado) ou "Cancelar agora" (inativa na hora, sem devolução do período pago). Dentro dos 7 dias do primeiro pagamento do plano vale o reembolso integral (Pedidos e validações). Cancelar não apaga dívida (decisão de 13/11/2026, parecer do advogado): a casa pode cancelar mesmo com fatura vencida; as cobranças futuras param e as faturas ainda não vencidas são canceladas, mas a fatura vencida continua aberta e exigível, e o aviso aparece antes e depois de confirmar. A conta inativa só reativa depois de quitar a fatura vencida (a tela mostra a fatura com Pix/cartão; quitada a dívida, a casa escolhe o plano e paga com cobrança imediata, sem período grátis). Segue recusado apenas com pagamento em processamento ou reembolso do plano em andamento. "Cancelar agora" tem confirmação extra ("não haverá reembolso dos dias restantes do ciclo já pago"). Cobrança automática só com aceite registrado: cartões salvos antes da regra de autorização têm a cobrança automática desligada e a casa é avisada para marcar a caixa em Planos. Exclusão de conta com pendência financeira (orientação do advogado, 13/11/2026): fica bloqueada, com o motivo na tela, se houver fatura vencida da plataforma, assinatura ativa, pagamento em processamento ou reembolso do plano em andamento; a trava só lê e não cria cobrança. Ao anonimizar, o cartão guardado é apagado e o Stripe desvincula o cartão e apaga o cliente (fila que repete em caso de falha); registros financeiros, de acesso e de aceite (inclusive a autorização da cobrança automática) ficam retidos por até 5 anos. **Aviso de 30 dias para mudar o prazo do bloqueio total (15/11/2026; migration 0124):** mudar o prazo no painel não vale na hora; o banco agenda a mudança para 30 dias depois, guarda o prazo em vigor, e avisa por notificação todas as casas matriculadas na cobrança (link para Planos). O painel não escolhe a data. Voltar ao prazo em vigor cancela a mudança e as casas são avisadas do cancelamento. Decisão aceita, ainda não construída: cobrança extrajudicial/negativação como faculdade, com aviso prévio, prevista nos Termos. Dados e créditos de IA ficam guardados (créditos até expirar ou serem reembolsados pelas regras próprias). Para voltar, a casa escolhe um plano e paga na tela de conta inativa.
- **Documento da casa (CPF/CNPJ), regra de entrada (15/11/2026):** aceita só dígitos, letras e `. - /` espaço; CNPJ alfanumérico da Receita (12 posições 0-9/A-Z + 2 dígitos; letra = ASCII − 48) é válido; guardado normalizado em maiúsculas.
- **Cobrança de dívida de conta abandonada (decisão de 13/11/2026, orientação do advogado):** hoje a plataforma não coleta CPF/CNPJ, então não há negativação nem protesto; a cobrança é a trava de reativação/exclusão (a dívida só deixa de valer ao ser paga) e a cobrança amigável pelos canais cadastrados, sempre mandando a pessoa entrar no app para pagar (nunca link de pagamento no e-mail). Os Termos [X].5 devem tirar a menção a cadastros de proteção ao crédito enquanto não houver CPF/CNPJ (rascunho ainda em revisão; texto dos Termos não alterado). **CPF/CNPJ da casa (decisões do proprietário, 15/11/2026; migration 0126):** pedido ao contratar plano pago (assinar, reativar, subir de plano, comprar vaga extra); a casa Grátis não informa. Casas que já assinam não são bloqueadas: o pedido aparece em Planos e o dado passa a ser exigido na próxima contratação. Os dígitos verificadores são conferidos. Guardado criptografado (chave no cofre do Supabase), sem leitura direta por nenhum usuário; a casa vê só o final mascarado e só o Suporte corrige. A administração consulta o número completo por função que exige motivo (10+ caracteres) e registra quem consultou, quando e por quê. Uso: cobrança e obrigações fiscais; retenção de 5 anos como os dados financeiros (rotina de descarte ao fim do prazo ainda por fazer). Pendente com o advogado: citar a coleta de CPF/CNPJ e a finalidade na Política de Privacidade e nos Termos, e rever a menção a cadastros de proteção ao crédito (negativação passa a ser possível).
- **Conta reutilizada (aprovado em 13/11/2026, opção B):** excluir a conta não impede cadastro novo com o mesmo e-mail, mas a nova conta é marcada (e-mail comparado sem +apelido e sem pontos no gmail, contra a identidade retida por 5 anos). O reembolso de 7 dias do plano só é negado quando uma conta anterior (excluída) do mesmo e-mail já o usou (parecer do advogado, 14/11/2026: negar a quem nunca o usou violaria o art. 49 do CDC); quem volta sem ter usado mantém o direito. A casa vê "Conta reutilizada: o reembolso de 7 dias do plano já foi utilizado em uma conta anterior vinculada a este e-mail e não é concedido novamente". A marca do e-mail por 5 anos cabe em exercício regular de direitos e prevenção a fraude (deve constar na Política de Privacidade, junto com a retenção do Stripe sobre cartões desvinculados). A administração vê a lista de contas reutilizadas, consulta o histórico retido (motivo obrigatório, registrado) e avisa pela plataforma com texto-modelo neutro. Textos do advogado para os Termos ([X].7, [X].8, [Y].2) e para a Política de Privacidade aplicados em 14/11/2026 por decisão do proprietário, sem nova revisão do advogado. Ajustes de precisão feitos por mim: onde o texto dele dizia "identificador de e-mail", os Termos dizem "e-mail do titular" (é o que o sistema guarda, só visível à administração); e a tarifa do provedor em reembolso parcial de créditos "fica por conta da plataforma" (como o sistema já faz; o texto dele dizia "retida", que podia ser lido ao contrário).
- **Sem selo** de pontualidade ("Casa em dia").
- **Preços** (plano, vaga adicional, destaque, impulsionamento, pacotes) ficam em tabela central editável no painel, com motivo e auditoria.
- **Cobrança automática no cartão (aprovado em 13/11/2026):** a casa autoriza (caixa de autorização, registrada com texto, valor e data) e o cartão é cobrado no dia do vencimento, com até 3 tentativas em dias seguidos; depois segue o fluxo normal de tolerância, suspensão e bloqueio. Vale para mensalidade e vagas extras (nunca pacote de créditos). A casa liga, desliga, troca e remove o cartão quando quiser.
- **Aceite dos Termos sem trava (aprovado em 13/11/2026, orientação do advogado):** mudança de Termos não bloqueia a tela. A pessoa é avisada por notificação, com registro de leitura. Aceite explícito só nos momentos de dinheiro (autorização do cartão e frase junto ao botão de pagar, com registro por compra). O caminho de reembolso fica em "Pedidos e validações", discreto e sem induzir o pedido.
- **Reembolso do primeiro pagamento do plano (aprovado em 13/11/2026):** em até 7 dias do primeiro pagamento do plano da casa, uma única vez por casa, devolução integral pelo mesmo meio de pagamento (a plataforma absorve a tarifa). Ao concluir o estorno: cobrança mensal encerrada, faturas abertas de plano e vagas extras canceladas, cobrança automática do cartão desligada e a casa fica inativa (tela de conta inativa; dados mantidos). Se o provedor recusar, nada muda. Créditos de IA têm reembolso próprio e não entram aqui.
- **Reativação da casa inativa (aprovado em 13/11/2026):** dois caminhos. (1) A própria casa reativa pagando, em Planos, escolhendo o plano em que volta (qualquer plano com mensalidade na tabela); ao confirmar o pagamento a casa volta sozinha, é matriculada de novo com vencimento no dia do pagamento e a cobrança automática continua desligada até a casa ligar. Esse pagamento é recontratação: não dá novo reembolso de 7 dias. (2) O suporte reativa pelo painel (motivo obrigatório, registro de auditoria), o que também encerra qualquer fatura de reativação aberta.
- **Atualização da tabela comercial / reajuste (aprovado em 13/11/2026, orientação do advogado):** sem índice. O administrador anuncia o novo valor de um plano; a vigência é no mínimo 30 dias depois do anúncio. Cada casa muda na sua primeira renovação (dia de cobrança dela) que cair na vigência ou depois; quem vence antes pula o reajuste. As casas matriculadas no plano recebem notificação (com push e registro de leitura) que diz a data da própria renovação. Na vigência a tabela de preços recebe o valor novo (rotina horária). Redução vale na hora; aumento direto na tabela é recusado com a cobrança ligada. Pendente de decisão do proprietário: o texto dos Termos fala em aviso por e-mail (não existe envio de e-mail hoje) e em cancelamento sem multa antes da renovação (não há botão de cancelar assinatura).
- **Contratação de plano dentro do app (aprovado em 14/11/2026):** a troca deixa de ser feita pelo suporte. (1) Primeira assinatura (casa no Base ou sem assinatura ativa): paga a mensalidade cheia; ao confirmar, o plano muda e o vencimento mensal passa a ser o dia do pagamento (o direito de reembolso de 7 dias vale normalmente). (2) Upgrade: sobe na hora e a casa paga só a diferença proporcional aos dias que faltam no ciclo (diferença das mensalidades × dias restantes ÷ dias do ciclo); o vencimento não muda. Fica indisponível nos 7 dias do primeiro pagamento (para não misturar com o reembolso integral), enquanto a fatura da próxima renovação já estiver gerada (ela nasceu com o plano atual), com fatura em atraso, pagamento em processamento ou cancelamento agendado. (3) Downgrade e volta ao Base: valem na próxima renovação, sem devolução; a fatura dessa renovação já sai com o valor do plano novo (se a da renovação seguinte já estiver gerada, vale na seguinte); pode ser desfeito até a fatura ser gerada; ao voltar ao Base a mensalidade e o cartão automático param e a casa segue ativa. Equipe acima do limite do plano novo fica desativada pelo próprio sistema (sem apagar). As faturas de assinatura e de upgrade são pedidas na hora pela casa: sem lembretes, nunca cobradas pelo cartão automático e nunca viram atraso (se não forem pagas, são canceladas depois de 2 dias).
- **Cobrança real** só é ligada por decisão expressa do proprietário.

---

# 19. PAGAMENTOS, COMISSÕES E FINANCEIRO

## 19.1 Comissões aprovadas

| Tipo | Comissão da plataforma |
|---|---:|
| Rituais coletivos | 15% |
| Demais transações elegíveis realizadas pela plataforma | 4% |

A casa recebe o restante, descontadas condições financeiras e tarifas do provedor conforme regra contratual aprovada. Base de cálculo deve ser definida por modalidade e registrada em snapshot.

## 19.2 Versionamento

Cada transação preserva percentual, base de cálculo, bruto, comissão, tarifas, líquido, provedor, identificador de cobrança, data, estado e regra comercial vigente.

Mudanças futuras não recalculam transações antigas. Percentual histórico de 17% presente em documentos e estruturas deve ser reconciliado. Não fazer alterações em massa sem auditoria.

## 19.3 Pagamento interno

Oferece registro da venda, comprovante, histórico, operação contínua, integração com assistente, gestão de pedidos/vagas, rastreabilidade, processo de cancelamento/reembolso e integração com CRM/indicadores.

A casa pode optar por atendimento manual e, em modalidades elegíveis, desativar a venda pela assistente (a página da casa continua vendendo). Isso não desativa automaticamente pagamento interno. Rituais coletivos permanecem obrigatoriamente no fluxo interno.

## 19.4 Provedor e retenção

A implementação identificada utiliza Stripe Connect. Direct charges e `application_fee_amount` não significam escrow ou retenção de recursos na conta da plataforma. Application fee representa comissão; não comprova retenção até três dias após evento.

Repasse, retenção, saldo, disputas e responsabilidades devem respeitar produtos e contratos efetivamente disponíveis no provedor escolhido. Não prometer retenção ou prazo de repasse sem validação técnica, contratual e jurídica.

Referências antigas a Asaas e Mercado Pago devem ser reconciliadas. Código/configuração histórica não comprova provedor ativo.

### 19.4.1 Estado da arquitetura financeira (EXEC-01)

Marketplace (Stripe Connect) e Platform Billing (cobranças próprias da plataforma; Stripe como adaptador inicial, com outros provedores incluídos depois por novo adaptador e escolhidos no painel admin, conforme §33.1) são domínios independentes, com integrações, registros, webhooks, estados financeiros e conciliações próprios; falha em um não pode afetar o outro. O contrato do Marketplace está implementado e testado em ambiente local (PR #140, Draft, ainda não aplicada em produção); o contrato recomendado para Platform Billing está em `docs/financeiro/CONTRATOS_MARKETPLACE_E_PLATFORM_BILLING.md` e **não está implementado**.

No Marketplace, o código da EXEC-01 registra por pagamento: provedor, conta de origem, sessão de checkout, PaymentIntent e Charge, comissão, tarifa do processador (desconhecida = pendente, nunca zero) e lançamentos no ledger. Validação em integração real (Stripe real e Edge Runtime do Supabase) ainda não foi feita e não deve ser afirmada.

## 19.5 Reembolsos

Distinguir cancelamento antes do início, não execução, atraso, execução iniciada/concluída, divergência, reclamação de qualidade, fraude e disputa.

Regra operacional registrada:
- Antes de a casa iniciar serviço/trabalho, o cliente pode solicitar reembolso com processamento automático conforme condições aplicáveis.
- Depois do início, solicitação segue para análise com contexto e registros.
- Atraso gera aviso inicialmente; não implica reembolso automático.
- Administração analisa casos que exigem decisão.

A plataforma gerencia o fluxo, registra decisão e solicita operação ao provedor. O provedor confirma a devolução. Nunca afirmar conclusão antes dessa confirmação.

## 19.6 Financeiro da casa e central

Casa visualiza vendas, bruto, comissões, tarifas, líquido, pagamentos, reembolsos, saldo/repasses conforme provedor, extratos, histórico e relatórios.

Administração visualiza volume transacionado, receita, assinaturas, créditos, campanhas, tarifas, reembolsos, disputas, conciliação, inconsistências e pendências.

## 19.7 Ledger

Operações financeiras possuem registro interno consistente, imutável em seus eventos originais e reconciliável com provedor. Não calcular receita/comissão/repasse apenas pelo estado visual do pedido. Valores monetários usam unidades inteiras da moeda, evitando ponto flutuante.

---

# 20. ÁREA DE MEMBROS E MENSALIDADES

A casa gerencia membros, valor de mensalidade, vencimento individual, situação do vínculo, histórico, pagamento pela plataforma ou diretamente à casa e inadimplência/notificações.

Quando pagamento ocorre pela plataforma, aplica-se comissão de 4%. Pagamento direto não pode ser registrado como confirmado pela plataforma sem validação. Membro não é automaticamente cliente ou seguidor.

---

# 21. NOTIFICAÇÕES

Centraliza mensagens, handoff, pedidos, pagamentos, reservas, rituais, agenda, mensalidades, reembolsos, avaliações, equipe, convites, campanhas, suporte e eventos administrativos.

Notificação aponta para entidade correspondente, respeita preferências/permissões, evita exposição sensível e duplicidade, e registra entrega/leitura quando aplicável. Falha de notificação não altera estado oficial do evento.

---

# 22. AVALIAÇÕES E REPUTAÇÃO

Somente compras realizadas pela plataforma geram avaliação comercial elegível, conforme regra definida.

Avaliação é vinculada ao pedido; duplicidade indevida é impedida; casa pode responder conforme regras; denúncias e moderação são disponíveis; histórico é preservado; reputação usa critérios transparentes.

Avaliação não prova automaticamente execução ou qualidade sem análise do contexto.

---

# 23. SUPORTE E OCORRÊNCIAS

Suporte contempla dúvidas, acesso, pagamentos, cancelamentos, reembolsos, não execução, atraso, divergência, denúncia, fraude, atendimento e problemas técnicos.

Cada ocorrência possui identificador, solicitante, casa/pedido relacionados quando aplicável, categoria, descrição, evidências, estado, responsável, histórico de decisões e resultado.

Administração possui visão de pendências, prioridades e prazos.

---

# 24. ADMINISTRAÇÃO CENTRAL

Gestão de casas: cadastro, verificação, aprovação, suspensão, reativação, moderação, histórico, planos e ocorrências.

Gestão comercial: planos, preços, comissões, vagas, créditos, campanhas, destaques, impulsionamentos, limites e parâmetros.

Gestão financeira: transações, conciliação, reembolsos, disputas, tarifas e relatórios.

Gestão de segurança: usuários, permissões, ações administrativas, auditoria e incidentes.

Documentos oficiais possuem versão, vigência, responsável, histórico, aprovação e registro de aceite quando necessário.

---

# 25. ARQUITETURA TÉCNICA-ALVO

## 25.1 Frontend

Stack identificada: Vite 5, React 18, TypeScript, React Router, Tailwind e Radix/shadcn. Evoluir a arquitetura existente sem migração de framework por preferência ou moda. Organizar por domínios, reutilizar componentes e aplicar carregamento eficiente.

## 25.2 Backend e persistência

Supabase é infraestrutura de referência: PostgreSQL, Auth, RLS, Storage e Edge Functions/Realtime quando adequados.

Banco é fonte persistente de verdade. Estado local melhora experiência, mas não substitui persistência, autorização ou transações no servidor.

## 25.3 Operações confiáveis

Pagamento, comissão, reserva, confirmação, reembolso, assinatura, controle de vagas, permissões e operações administrativas críticas ocorrem em ambiente confiável. Chaves privilegiadas nunca são expostas no frontend.

## 25.4 Integrações

Provedores de pagamento, IA, e-mail, push e mídia são isolados por adaptadores. Trocar fornecedor não deve exigir reconstrução dos módulos de negócio.

## 25.5 Ownership dos dados

| Entidade | Módulo proprietário | Consumidores principais |
|---|---|---|
| Identidade | Auth/Identidade | Todos |
| Casa | Gestão de casas | Descoberta, CRM, catálogo |
| Oferta | Catálogo | Assistente, checkout, perfil |
| Agenda | Agenda | Assistente, reservas, casa |
| Ritual | Rituais | Descoberta, checkout, CRM |
| Reserva | Reservas | Agenda, checkout, CRM |
| Pedido | Pedidos | Cliente, casa, CRM, financeiro |
| Pagamento | Financeiro | Pedidos, CRM, administração |
| Comissão | Financeiro | Relatórios, repasses |
| Conversa/mensagem | Atendimento | Assistente, CRM, equipe |
| Cliente global | Identidade | CRM e casas autorizadas |
| Vínculo com casa | Relacionamento | CRM, membros, permissões |
| Equipe | Gestão de equipe | Painel, autorização |
| Permissão | Autorização | Todos |
| Publicação | Rede social | Feed, descoberta, divulgação |
| Campanha | Divulgação | Feed, descoberta, financeiro |
| Avaliação | Reputação | Perfil, casa, administração |
| Ocorrência | Suporte | Financeiro, casa, administração |
| Assinatura | Planos | Capacidades, financeiro |

Módulo consumidor não se torna proprietário de dados alheios apenas para simplificar uma tela.

---

# 26. SEGURANÇA, PRIVACIDADE E LGPD

RLS protege dados por organização e usuário. Backend valida permissões. Operações privilegiadas são restritas. Rotas protegidas no frontend não substituem autorização no servidor.

Informações que revelem convicção ou prática religiosa podem ser dados pessoais sensíveis. Coletar apenas o necessário, explicar finalidade, restringir acesso, controlar retenção, atender direitos do titular e evitar exposição em logs, prompts e notificações.

Auditar alteração de permissões, plano, comissão, operações financeiras, reembolsos, suspensões, ações administrativas e acessos excepcionais.

Aplicar idempotência, validação de webhook, rate limiting, gestão de sessão, proteção de arquivos, backup/recuperação, monitoramento e gestão de incidentes.

---

# 27. EXPERIÊNCIA, PERFORMANCE E ACESSIBILIDADE

Experiência consistente em celular, tablet e desktop. Requisitos: layout responsivo, navegação clara, carregamento, estados vazios, erros úteis, feedback, prevenção de duplicidade, teclado, contraste, semântica, foco visível, imagens otimizadas, lazy loading, rotas previsíveis, SEO público e tratamento de falhas de rede.

Priorizar velocidade sem sacrificar consistência ou segurança.

---

# 28. INDICADORES E INTELIGÊNCIA

## 28.1 Indicadores da casa

Visualizações, alcance, seguidores, conversas, intenções, conversão, vendas, volume, ticket médio, ocupação de vagas, reservas, cancelamentos, reembolsos, recorrência, desempenho da assistente, tempo de resposta, pendências e avaliações.

- **Construído em 16/11/2026 (migration 0132):** seguidores, pessoas que falaram, tempo de resposta (mediana), pedidos criados e pagos, conversão, cancelados ou vencidos, valor vendido, ticket médio, vagas e ocupação, clientes que voltaram, avaliações e reembolsos, cada um com período anterior, definição e origem. Desempenho da assistente fica no relatório próprio e pendências na central. **Ainda sem registro:** visualizações e alcance do perfil (dependem de registrar visitas) e intenções além das conversas. A equipe com a permissão de indicadores nunca vê dinheiro, reembolsos nem avaliações.

## 28.2 Indicadores centrais

Casas/usuários ativos, crescimento, conversão, volume transacionado, receita de comissão/assinatura/divulgação, retenção, cancelamento, reembolsos, disputas, qualidade do atendimento, custo de IA, uso de recursos e incidentes.

- **Construído em 16/11/2026 (migration 0133, só administração):** contas e casas novas, conversão para plano pago, volume transacionado, receita (comissão, assinatura, divulgação, créditos), cobranças vencidas e canceladas, reembolsos, estornos, contestações, disputas, incidentes graves, qualidade do atendimento (primeira resposta e prazo), uso de IA (tokens), ativos, casas por plano e retenção de assinantes, cada um com período anterior, definição e origem. **Limites:** "ativos" vem do último acesso (sem histórico); conversão e retenção usam cobranças de plano pagas, pois não há histórico de plano; cancelamento de assinatura ainda não tem registro próprio. **Atualizado em 16/11/2026 (migration 0134):** passaram a existir o histórico de plano (cancelamentos, conversão e retenção exatas, a partir dessa data) e os dias de atividade (pessoas e casas ativas por período, só a data do acesso, apagados com a conta).
- **Links exatos nas pendências da casa (16/11/2026, só front):** cada pendência abre a tela exata (Serviços, Avaliações, início com o cartão de recebimento em foco, /planos com a fatura destacada, Atendimento por aba para a equipe). Regra de ouro: páginas `/casa/:id` e `/mensagens/:id` usam o id da CONTA, nunca o id interno da casa; há varredura automática que impede o erro.

## 28.3 Inteligência

Identificar ofertas procuradas, horários de demanda, campanhas eficientes, conversão, gargalos, retenção, consumo de IA e riscos. Dados agregados respeitam privacidade e não expõem dados sensíveis indevidamente.

---

# 29. MATRIZ MESTRA DE CAPACIDADES E POTENCIALIZAÇÃO

| Domínio | Capacidade central | Configuração/autonomia | Automação/integração | Critério de excelência |
|---|---|---|---|---|
| Identidade | Conta e sessão | Dados e privacidade | Auth e permissões | Identidade consistente e segura |
| Casas | Perfil e operação | Dados públicos/internos | Catálogo, agenda, CRM | Gestão completa por organização |
| Descoberta | Busca e recomendação | Filtros e abrangência | Perfil, catálogo, divulgação | Encontrar casa/oferta adequada |
| Catálogo | Gestão de ofertas | Campos e modalidades | Assistente e checkout | Oferta confiável e contratável |
| Agenda | Disponibilidade | Horários e bloqueios | Reservas e notificações | Sem conflitos de capacidade |
| Rituais | Eventos e vagas | Dados e regras | Assistente, checkout, CRM | Participação rastreável |
| Assistente | Atendimento e ação | Modos e permissões | Catálogo, agenda, pedidos | Automação precisa e auditável |
| Atendimento | Conversas | Responsáveis | Handoff e CRM | Continuidade sem perda de contexto |
| CRM | Relacionamento | Segmentos e tarefas | Eventos dos módulos | Visão integrada da pessoa |
| Equipe | Colaboradores | Permissões granulares | Convites e auditoria | Delegação segura |
| Rede social | Publicações/interações | Privacidade e moderação | Feed e descoberta | Comunidade saudável |
| Divulgação | Campanhas | Abrangência e duração | Financeiro e distribuição | Promoção mensurável |
| Planos | Assinaturas e limites | Recursos e adicionais | Financeiro/capacidades | Cobrança e acesso coerentes |
| Financeiro | Transações e ledger | Regras comerciais | Provedor, pedidos, reembolsos | Conciliação e rastreabilidade |
| Membros | Vínculos e mensalidades | Valores e vencimentos | Pagamentos/notificações | Gestão recorrente |
| Notificações | Comunicação de eventos | Preferências | Todos os módulos | Entrega correta sem duplicidade |
| Reputação | Avaliações | Elegibilidade | Pedidos e suporte | Confiança e moderação |
| Suporte | Ocorrências | Categorias/prioridades | Financeiro/administração | Resolução rastreável |
| Administração | Governança | Parâmetros centrais | Todos os módulos | Controle e visão global |
| Inteligência | Indicadores | Métricas e filtros | Dados operacionais | Decisão baseada em evidência |

Cada domínio deve ser avaliado por: ferramentas existentes, capacidades, configurações, automações, delegação humana, integrações, inteligência, monetização, segurança, indicadores e critérios de evolução.

---

# 30. JORNADAS PONTA A PONTA

## 30.1 Cliente

Descobre casas → acessa perfil → conhece ofertas → segue se desejar → inicia conversa/contratação → recebe atendimento automatizado ou humano → escolhe oferta → informa dados necessários → realiza checkout → aguarda confirmação → recebe confirmação → acompanha pedido/reserva/ritual → recebe notificações → avalia se elegível → retorna ou mantém relacionamento.

## 30.2 Casa

Cadastra-se → configura identidade/perfil → define informações públicas → escolhe plano → configura catálogo → agenda → assistente → publica conteúdo/ofertas → recebe visitantes/seguidores → atende → recebe intenções → executa vendas → gerencia pedidos/agenda → clientes/equipe → financeiro → divulgação → indicadores → otimiza operação.

## 30.3 Contratação com horário

Cliente consulta → assistente consulta oferta e agenda → apresenta horários → cliente escolhe → backend valida → reserva temporária de 15 minutos → pagamento → confirmação do provedor → backend converte reserva → agenda bloqueada → notificações → atendimento → registro de início/término quando aplicável → histórico → avaliação elegível.

## 30.4 Ritual coletivo

Casa cadastra → validação → publicação → cliente descobre → assistente informa → cliente aceita → reserva temporária → checkout → pagamento confirmado → participação registrada → notificações → vagas atualizadas → encerramento por esgotamento ou limite de uma hora → início → notificação → término → notificação → histórico e ocorrências.

## 30.5 Handoff

Cliente conversa → intenção identificada → configuração impede conclusão automatizada → assistente informa encaminhamento → intenção registrada → casa notificada → CRM cria pendência → atendente assume mesma conversa → contexto preservado → atendimento prossegue.

---

# 31. ESTADO DO PRODUTO E EVIDÊNCIAS

O Blueprint define o produto-alvo. Arquivos, páginas ou migrations não comprovam por si só que uma funcionalidade está operacional em produção.

## 31.1 Evidências identificadas no repositório de referência

Foram localizadas páginas/rotas relacionadas a feed, descoberta, perfil público, atendimento, mensagens, rituais, divulgação, boost, destaques, equipe/convites, membros/mensalidades, planos, administração, suporte e retornos de pagamento.

Foram localizadas bibliotecas relacionadas a agenda, assistente e avaliação, calendário, campanhas, catálogo, consentimentos, eventos, seguidores, planos, relatórios, membros, mensagens, notificações, pagamentos, preços, casas públicas, reembolsos, autenticação/dados remotos, avaliações, rituais, pedidos, serviços, equipe, armazenamento e Supabase.

O repositório contém migrations numeradas de 0001 a 0063 e estruturas relacionadas a assistente, serviços, rituais, mensagens, pagamentos, agenda, fila de espera, equipe, avaliações, divulgação e permissões.

Isso comprova estrutura técnica e de domínio no repositório, mas não substitui testes integrados, validação RLS ou confirmação de produção.

## 31.2 Classificação de evidências

| Estado | Significado |
|---|---|
| Confirmado em código | Implementação identificada e analisada |
| Testado | Fluxo executado com evidência reproduzível |
| Validado integrado | Módulos/estados testados ponta a ponta |
| Declarado pelo proprietário | Funcionamento informado, sem validação independente |
| Parcial | Implementação existe, mas faltam partes/integração |
| Não verificado | Evidência insuficiente |
| Lacuna | Capacidade necessária não implementada ou comprovadamente insuficiente |
| Decisão pendente | Regra de produto/negócio ainda não definida |

## 31.3 Reconciliações técnicas necessárias

- Percentuais históricos de 17% versus regra vigente de 15%/4%.
- Referências residuais a provedores antigos.
- Diferença entre integração de pagamento e retenção de valores.
- Estado real de RLS e exposição pública de perfis.
- Fluxo de convite e permissões de equipe.
- Continuidade do handoff humano.
- Persistência e recuperação de estado.
- CRM unificado versus recursos dispersos.
- Consistência entre agenda, reserva e checkout.
- Histórico de migrations no Supabase versus migrations no repositório.

Esses itens pertencem à reconciliação técnica e ao Roadmap, não justificam outro Blueprint.

---

# 32. CRITÉRIOS DE EXCELÊNCIA E CONCLUSÃO

O produto será estruturalmente consistente quando:
1. Os quatro ambientes estiverem integrados.
2. Identidade global e isolamento entre casas estiverem corretos.
3. Motor de capacidades for fonte central de disponibilidade/autorização.
4. Catálogo alimentar assistente, perfil e checkout sem divergência.
5. Agenda controlar disponibilidade transacionalmente.
6. Rituais coletivos respeitarem fluxo interno obrigatório.
7. Checkout/pagamento possuírem confirmação confiável.
8. Reservas temporárias forem idempotentes e seguras.
9. Handoff preservar conversa, intenção e contexto.
10. CRM integrar relacionamento sem duplicar dados.
11. Equipe possuir convites e permissões granulares.
12. Rede social possuir moderação e privacidade.
13. Destaque e impulsionamento forem distintos e mensuráveis.
14. Planos/adicionais controlarem recursos centralmente.
15. Financeiro possuir ledger e conciliação.
16. Reembolsos possuírem estados e evidências.
17. Notificações refletirem eventos reais.
18. Avaliações forem vinculadas a experiências elegíveis.
19. Suporte/administração possuírem trilha de auditoria.
20. Segurança/LGPD forem aplicadas em todas as camadas.
21. Indicadores refletirem dados confiáveis.
22. Experiência móvel/desktop for consistente.
23. Operações críticas possuírem testes automatizados.
24. Falhas, duplicidades e concorrência forem tratadas.
25. Crescimento não gerar duplicação de regras ou fontes de verdade.

---

# 33. GOVERNANÇA DE MUDANÇAS

- **Mudança de implementação:** não altera produto/regra; pertence ao código e relatório.
- **Evolução operacional:** melhora capacidade definida; pertence ao Roadmap e execução.
- **Mudança de produto:** altera jornada, capacidade ou comportamento; exige aprovação e registro no Blueprint.
- **Mudança comercial/jurídica:** altera preço, comissão, contrato, responsabilidade ou política; exige aprovação específica e validação apropriada.

Não criar nova versão documental para cada mudança de implementação. Decisão técnica isolada não altera o produto aprovado.

## 33.1 Registro de mudanças aprovadas

### 12/11/2026 (aprovação do proprietário, em conversa)

| Mudança | Motivo | Impacto |
|---|---|---|
| **Provedor da cobrança da plataforma:** Stripe como adaptador inicial, no lugar da Efí citada em §19.4.1. Outros provedores entram depois por adaptador, escolhidos no painel admin. | O Stripe já está integrado e cobre cartão, cartão recorrente e Pix avulso. A Efí e outros ficam como opções futuras. | Platform Billing nasce com o Stripe. Chaves ficam nos segredos do Supabase, nunca no painel. O painel escolhe provedor por tipo de cobrança, meios habilitados e prazos. |
| **Preços dos planos** confirmados: Essencial R$ 89,90, Profissional R$ 179,90, Premium R$ 299,90 (§18.1). | O código e a produção ainda tinham R$ 139,90 e R$ 199,00. | Configuração de produção alinhada ao Blueprint. Sem cobrança real. |
| **Inadimplência e cobrança da plataforma** (§18.5). | Definir calendário, avisos, tolerância e suspensão parcial. | Novo domínio de cobrança, com calendário no banco. |
| **Créditos de IA** (§18.3): validade de 3 meses, reembolso proporcional em até 7 dias, ordem de consumo e avisos. | Fechar as regras exigidas antes da venda. | Pacotes só à venda após implementação e testes. Reembolso de 7 dias implementado e testado (migration 0095). |

### 13/11/2026 (aprovação do proprietário, em conversa, com orientação do advogado)

| Mudança | Motivo | Impacto |
|---|---|---|
| **Cobrança automática no cartão, aceite sem trava, reembolso do primeiro pagamento do plano, reativação (pela casa pagando ou pelo suporte) e atualização da tabela comercial com aviso de 30 dias** (§18.5). | Fechar as regras de renovação, desistência e reajuste antes da cobrança real. | Implementado em modo de teste (migrations 0094 a 0100). Cobrança real continua só com autorização expressa. Termos ainda em revisão do advogado. |
| **Cancelamento da assinatura pela casa e tela única de conta bloqueada/inativa** (§18.5): bloqueio total deixa de ser "painel só para consulta" e passa a mostrar uma única tela, com o fluxo de pagar (bloqueada) ou de escolher plano (inativa); trava de gravação no servidor. | Dar à casa um caminho claro e justo para sair e voltar, e impedir uso da plataforma sem pagamento. | Implementado em modo de teste (migration 0101). Termos: a promessa de cancelamento sem multa agora tem botão; segue pendente o aviso por e-mail (decisão do proprietário: incluir e-mail só para avisos importantes antes de terminar a plataforma). |

---

# 34. DOCUMENTOS SUBORDINADOS

Este Blueprint é a autoridade de produto. Documentos subordinados:
1. Roadmap: fases, dependências, prioridades, lacunas e critérios.
2. Matriz de permissões por plano: recursos, limites e condições.
3. Regras financeiras: comissões, tarifas, repasses, cancelamentos, reembolsos e conciliação.
4. Arquitetura técnica: contratos, entidades, ownership, integrações, eventos e segurança.
5. Protocolo de execução/auditoria: escopo, evidências, testes e validação.
6. Documentação operacional: guias para casas, clientes, equipe e administração.

Nenhum documento subordinado pode contrariar o Blueprint sem aprovação de mudança.

---

# 35. DECLARAÇÃO FINAL

O Ilê Conecta é um ecossistema integrado para descoberta, relacionamento, atendimento, comercialização e gestão de casas espirituais.

Seu valor não está em possuir muitas telas ou funcionalidades isoladas, mas em conectá-las por identidade, dados, permissões, eventos, automações e regras consistentes.

A casa deve operar sua presença digital e relacionamento com clientes em um ambiente integrado. O cliente deve descobrir, conversar, contratar, pagar e acompanhar sua experiência sem rupturas. A plataforma deve controlar com segurança recursos, transações, permissões, ocorrências e evolução do ecossistema.

**Este documento é a definição central do produto-alvo. O Roadmap transforma essa definição em entregas verificáveis sem reabrir continuamente a concepção do produto.**

**Status:** consolidado para aprovação do proprietário.  
**Não constitui autorização automática para merge, deploy, migrations, cobrança real ou alteração de produção.**

---

# INSTRUÇÃO AO EXECUTOR (CLAUDE)

Antes de qualquer execução no Ilê Conecta:

1. Leia integralmente este Blueprint.
2. Leia o Roadmap vigente e o protocolo de execução/auditoria, quando adicionados ao repositório.
3. Trate este documento como autoridade de produto, respeitando decisões posteriores formalmente aprovadas pelo proprietário/CTO.
4. Não redesenhe funcionalidades, jornadas, regras comerciais ou arquitetura por iniciativa própria.
5. Não recrie ferramentas já existentes. Primeiro investigue, reutilize e integre.
6. Não altere a dinâmica existente do produto por inferência documental.
7. Não faça mudanças fora do escopo explícito da ordem de execução.
8. Não execute merge, deploy, migrations, alteração de produção, mudança de provedor ou ativação de cobrança sem autorização expressa.
9. Diferencie sempre implementado, testado, validado integrado e não verificado.
10. Ao encontrar divergência entre código e Blueprint, não faça correção unilateral fora do escopo: documente a evidência, avalie impacto e solicite orientação quando necessário.
11. Preserve compatibilidade e dados existentes. Mudanças de regra financeira devem ser versionadas e nunca recalcular transações históricas.
12. Entregue evidências reproduzíveis: arquivos/diffs, testes executados, resultados, limitações e riscos.

**Regra de precedência:** ordem de execução aprovada define o escopo imediato; Blueprint define o produto; Roadmap define sequência e prioridade. Nenhum desses documentos autoriza automaticamente ações destrutivas ou mudanças em produção.

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

Segmentação respeita consentimento, finalidade e restrições de dados sensíveis. Funil comercial é ferramenta de análise e não substitui estados oficiais.

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

São produtos distintos.

- **Destaque:** posicionamento privilegiado de uma casa, oferta ou ritual em áreas estratégicas. Aumenta visibilidade de uma entidade.
- **Impulsionamento:** amplia distribuição de uma publicação ou conteúdo. Aumenta alcance de um conteúdo.

Ambos podem ter abrangência cidade, estado ou país e duração de 3, 7 ou 20 dias.

Toda promoção é identificada. Período contratado é respeitado; início e expiração são controlados; cobrança vinculada à campanha; resultados apresentados; frequência e elegibilidade controladas. Preços, posições e limites são parâmetros comerciais administráveis, não valores espalhados pelo código.

---

# 18. PLANOS, ASSINATURAS E MONETIZAÇÃO

## 18.1 Planos

| Plano | Mensalidade |
|---|---:|
| Essencial | R$ 89,90 |
| Profissional | R$ 179,90 |
| Premium | R$ 299,90 |

Direcionamento:
- **Essencial:** presença e operação básica; atendimento manual; sem assistente virtual.
- **Profissional:** recursos ampliados; assistente limitada; vendas e automações nos limites contratados.
- **Premium:** conjunto amplo; assistente completa; capacidades ampliadas de operação, gestão e divulgação.

A matriz exata de recursos e limites deve ser central. Módulos não criam regras próprias de plano.

## 18.2 Equipe adicional

| Plano | Regra |
|---|---|
| Essencial | R$ 29,90/mês por vaga adicional |
| Profissional | R$ 39,90/mês por vaga adicional |
| Premium | 1 vaga adicional incluída; extras R$ 39,90/mês |

Cobrança e vagas permanecem sincronizadas. Upgrades, downgrades e cancelamentos não podem gerar vagas duplicadas ou cobranças indevidas.

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

- **Meios:** cartão, cartão recorrente e Pix avulso. O sistema emite mensalmente a cobrança (boleto ou QR code Pix, conforme o provedor), com aviso mínimo de 3 dias antes do vencimento (prazo configurável no painel).
- **Calendário próprio:** o calendário de cobranças, os avisos e a tolerância ficam no banco da plataforma. O provedor só processa o pagamento.
- **Avisos escalonados:** fatura disponível; véspera e dia do vencimento; durante a tolerância ("pague e evite a suspensão").
- **Tolerância:** 3 dias úteis após o vencimento. Sem multa nem juros. Não há suspensão enquanto houver pagamento em processamento.
- **Suspensão automática e parcial:** a casa só conclui o que já estava em andamento. Não pode fazer novas vendas ou reservas pela plataforma nem iniciar campanhas. Destaques e impulsionamentos ficam pausados. Mantém acesso aos próprios dados. Reverte automaticamente com o pagamento.
- **Sem selo** de pontualidade ("Casa em dia").
- **Preços** (plano, vaga adicional, destaque, impulsionamento, pacotes) ficam em tabela central editável no painel, com motivo e auditoria.
- **Cobrança automática no cartão (aprovado em 13/11/2026):** a casa autoriza (caixa de autorização, registrada com texto, valor e data) e o cartão é cobrado no dia do vencimento, com até 3 tentativas em dias seguidos; depois segue o fluxo normal de tolerância, suspensão e bloqueio. Vale para mensalidade e vagas extras (nunca pacote de créditos). A casa liga, desliga, troca e remove o cartão quando quiser.
- **Aceite dos Termos sem trava (aprovado em 13/11/2026, orientação do advogado):** mudança de Termos não bloqueia a tela. A pessoa é avisada por notificação, com registro de leitura. Aceite explícito só nos momentos de dinheiro (autorização do cartão e frase junto ao botão de pagar, com registro por compra). O caminho de reembolso fica em "Pedidos e validações", discreto e sem induzir o pedido.
- **Reembolso do primeiro pagamento do plano (aprovado em 13/11/2026):** em até 7 dias do primeiro pagamento do plano da casa, uma única vez por casa, devolução integral pelo mesmo meio de pagamento (a plataforma absorve a tarifa). Ao concluir o estorno: cobrança mensal encerrada, faturas abertas de plano e vagas extras canceladas, cobrança automática do cartão desligada e a casa fica inativa pelo bloqueio total já existente (dados mantidos). Se o provedor recusar, nada muda. Créditos de IA têm reembolso próprio e não entram aqui.
- **Reativação da casa inativa (aprovado em 13/11/2026):** dois caminhos. (1) A própria casa reativa pagando, em Planos, escolhendo o plano em que volta (qualquer plano com mensalidade na tabela); ao confirmar o pagamento a casa volta sozinha, é matriculada de novo com vencimento no dia do pagamento e a cobrança automática continua desligada até a casa ligar. Esse pagamento é recontratação: não dá novo reembolso de 7 dias. (2) O suporte reativa pelo painel (motivo obrigatório, registro de auditoria), o que também encerra qualquer fatura de reativação aberta.
- **Atualização da tabela comercial / reajuste (aprovado em 13/11/2026, orientação do advogado):** sem índice. O administrador anuncia o novo valor de um plano; a vigência é no mínimo 30 dias depois do anúncio. Cada casa muda na sua primeira renovação (dia de cobrança dela) que cair na vigência ou depois; quem vence antes pula o reajuste. As casas matriculadas no plano recebem notificação (com push e registro de leitura) que diz a data da própria renovação. Na vigência a tabela de preços recebe o valor novo (rotina horária). Redução vale na hora; aumento direto na tabela é recusado com a cobrança ligada. Pendente de decisão do proprietário: o texto dos Termos fala em aviso por e-mail (não existe envio de e-mail hoje) e em cancelamento sem multa antes da renovação (não há botão de cancelar assinatura).
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

A casa pode optar por atendimento manual e, em modalidades elegíveis, desativar venda pela plataforma. Isso não desativa automaticamente pagamento interno. Rituais coletivos permanecem obrigatoriamente no fluxo interno.

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

## 28.2 Indicadores centrais

Casas/usuários ativos, crescimento, conversão, volume transacionado, receita de comissão/assinatura/divulgação, retenção, cancelamento, reembolsos, disputas, qualidade do atendimento, custo de IA, uso de recursos e incidentes.

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

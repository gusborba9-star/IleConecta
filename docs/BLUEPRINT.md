# Ilê Conecta — Blueprint de Produto e Sistema

> **Estado documental:** proposta de baseline para revisão do CTO; **não aprovado**.  
> **Origem:** DOC-02, ordem do CTO registrada na conversa em 2026-10-23/24; inspeção do repositório em `main` SHA `93e7060756b29d397b75f2151d870606a33b9692` e branch `exec-01/fix-vite-build-vercel` SHA `fc69a5938c48f92cd79176d2b57de0930ffde5cd`.  
> **Regra de leitura:** “confirmado” significa explicitamente definido pelo CTO na ordem DOC-02; “recuperado/não validado” significa evidência encontrada no código ou histórico, sem aprovação funcional; “proposta” exige decisão do CTO. Este documento não transforma protótipo em produto operacional.

## 1. Governança e fontes

Hierarquia obrigatória: **BLUEPRINT → ROADMAP → EXECUÇÕES → CÓDIGO**. O Blueprint define o produto e os requisitos; o Roadmap organiza fases aprovadas; cada execução autorizada implementa escopo limitado; o código só comprova implementação quando associado a testes e evidências.

Fontes verificadas:
- [README.md em main](https://github.com/gusborba9-star/IleConecta/blob/main/README.md), blob `2409ff6e4248d76c2bf1b56ab418549ca7be0a90`: README padrão de OnSpace, descreve Vite, TypeScript, React, shadcn/ui e Tailwind; não contém requisitos de produto.
- [AppContext.tsx em main](https://github.com/gusborba9-star/IleConecta/blob/main/src/contexts/AppContext.tsx): estado de aplicação e fluxos locais de demonstração.
- [storage.ts em main](https://github.com/gusborba9-star/IleConecta/blob/main/src/lib/storage.ts): persistência via `localStorage`.
- [mockData.ts em main](https://github.com/gusborba9-star/IleConecta/blob/main/src/lib/mockData.ts): usuários, casas, rituais e conteúdo fictícios.
- [RitualPurchaseModal.tsx em main](https://github.com/gusborba9-star/IleConecta/blob/main/src/components/ritual/RitualPurchaseModal.tsx): compra simulada; taxas de demonstração variam.
- [Roadmap de execução em branch EXEC-01](https://github.com/gusborba9-star/IleConecta/blob/exec-01/fix-vite-build-vercel/ROADMAP.md): registro da execução técnica, não Roadmap integral aprovado.
- [PR #1 — EXEC-01](https://github.com/gusborba9-star/IleConecta/pull/1): em rascunho, testes locais pendentes.

A busca cobre o repositório e branches acessíveis listadas na inspeção; não prova que não existam decisões em conversas antigas, OnSpace, outro repositório ou fontes não acessíveis.

## 2. Propósito, visão e proposta de valor

**Confirmado pelo contexto recuperado, ainda sujeito à validação formal no repositório:** Ilê Conecta é concebido como plataforma digital para conectar pessoas a casas religiosas, permitir descoberta e divulgação de casas e atividades, e apoiar interações e reservas.

**Proposta de formulação para aprovação:** oferecer uma presença digital organizada para casas religiosas e um caminho claro e seguro para pessoas encontrarem casas, conhecerem atividades e solicitarem ou reservarem participação, com transparência comercial e operacional.

**Públicos a validar:** (a) pessoas visitantes/participantes; (b) responsáveis e operadores de casas religiosas; (c) equipe de suporte/moderação; (d) administradores internos da plataforma. A existência e os poderes exatos dos perfis internos são decisões pendentes.

## 3. Perfis, permissões e responsabilidades

| Perfil | Estado da definição | Responsabilidades pretendidas | Limites pendentes |
|---|---|---|---|
| Visitante não autenticado | Proposta | Consultar páginas públicas e descobrir casas/atividades públicas | Quais ações exigem conta |
| Pessoa cadastrada | Recuperado do modelo de tipos/UI; não validado | Gerenciar perfil, conversar e solicitar/reservar atividades | Identidade, verificação, consentimentos, exclusão |
| Responsável/operador da casa | Recuperado como tipo `commercial` e `HouseUser`; não validado | Manter página, publicar conteúdo e administrar atividades próprias | Verificação da casa, delegação de equipe e permissões |
| Suporte/moderação | Proposta | Tratar denúncias, incidentes e suporte | Escopo, acesso excepcional, auditoria |
| Administrador da plataforma | Proposta | Gerenciar operação, políticas e contas | Separação de funções e aprovações de alto risco |
| Serviço de backend/webhook | Proposta técnica | Processar operações autorizadas e eventos do provedor | Identidade de serviço, segredos e limites de confiança |

**Regra de segurança proposta:** negar por padrão; validar permissões no servidor em toda operação sensível; não confiar em perfil, preço, valor, estado ou ID fornecido apenas pelo frontend. Nenhuma matriz de autorização de produção foi encontrada no código/documentos consultados.

## 4. Casas religiosas, páginas públicas e descoberta

**Recuperado como conceitos/modelos de demonstração:** casas com nome, descrição, localização, categoria, tags, imagem, publicações, stories e perfil público; telas de descoberta e página da casa existem no frontend.

**Comportamento pretendido — proposta a aprovar:**
1. Cadastro da casa e do responsável.
2. Verificação de legitimidade/representação segundo política a definir.
3. Publicação de página e conteúdos sujeitos a regras de moderação.
4. Descoberta por critérios aprovados (localização, categoria e tags, se autorizados).
5. Atualização, desativação e denúncia com trilha de auditoria.
6. Dados públicos limitados ao que a casa escolheu publicar; dados privados protegidos por autorização.

Critérios de aceite a definir pelo CTO: evidência de verificação, campos obrigatórios, política de conteúdo, regras de visibilidade, moderação e tratamento de denúncias.

## 5. Eventos, rituais, serviços, cadastros e reservas

**Recuperado do código de demonstração:** entidade `Ritual` com casa associada, título/descrição, preço, vagas, modalidade, data e categoria; componente de compra simula processamento e confirmação; os exemplos usam percentuais de plataforma de 10%, 12% e 15%, que **não são a regra financeira aprovada**.

**Modelo de ciclo de vida proposto (não implementado/validado):**
- Publicação: `RASCUNHO → PUBLICADO → ENCERRADO` ou `CANCELADO`.
- Reserva: `INICIADA → AGUARDANDO_PAGAMENTO → CONFIRMADA`; alternativas `EXPIRADA`, `CANCELADA`, `REEMBOLSO_PENDENTE`, `REEMBOLSADA`.
- Pagamento: estados próprios sincronizados com o provedor, sem inferir pagamento confirmado por retorno do navegador.
- Repasse: `BLOQUEADO → ELEGÍVEL → SOLICITADO/PROCESSANDO → PAGO`, com estados de falha/retenção a definir.

Esses estados são uma proposta de domínio para revisão, não estados históricos confirmados. A semântica final, transições permitidas, prazos, concorrência de vagas e regras de cancelamento precisam de aprovação.

## 6. Fluxos principais

### 6.1 Pessoa participante — proposta
1. Descobrir casas e consultar página pública.
2. Consultar atividade, preço total, regras, data, modalidade, vagas e política de cancelamento.
3. Autenticar-se quando exigido e aceitar termos aplicáveis.
4. Solicitar reserva; backend valida disponibilidade e cria operação idempotente.
5. Receber instrução Pix do provedor em ambiente permitido.
6. Backend confirma pagamento por evento autenticado e conciliado; só então confirma a reserva.
7. Receber comprovante/estado e instruções da casa.
8. Consultar/cancelar conforme política; reembolso e repasse seguem regras e direitos aplicáveis.

### 6.2 Casa religiosa — proposta
1. Cadastrar-se e passar por verificação definida.
2. Manter perfil e conteúdo.
3. Criar atividade com vagas, preço e termos.
4. Acompanhar reservas e estados de pagamento sem acesso a dados além do necessário.
5. Após o evento, a operação de repasse passa por elegibilidade, janela operacional e verificações de cancelamento/reembolso.
6. Consultar extrato conciliado e trilha de alterações.

### 6.3 Administração e suporte — proposta
- Gerenciar denúncias, incidentes e solicitações com privilégios mínimos.
- Ações administrativas sensíveis exigem motivo, identidade do operador e registro auditável.
- Não permitir que suporte altere pagamento/repasse sem fluxo de aprovação e trilha.
- Procedimentos de contingência e escalonamento ainda precisam de definição.

## 7. Módulos e dependências

| Módulo | Estado observado | Dependências principais | Prioridade |
|---|---|---|---|
| Interface pública, descoberta e páginas de casa | UI/modelos encontrados; operação de produção não validada | API, dados confiáveis, moderação | Proposta de prioridade inicial |
| Cadastro, login e sessão | UI/modelo local encontrado; autenticação segura não demonstrada | Provedor de identidade/backend, autorização | Bloqueador de produção |
| Publicações, stories e mensagens | Modelos/UI encontrados; persistência local/demonstração | Backend, autorização, moderação, proteção de dados | A aprovar |
| Atividades e reservas | UI/modelos encontrados; compra simulada | Backend transacional, disponibilidade, pagamentos | A aprovar |
| Pix/Asaas Sandbox | Previsto na ordem DOC-02; integração funcional não comprovada | Contrato/produto Asaas, backend, webhooks, conciliação | Bloqueado por decisões e validação |
| Repasses, cancelamentos e reembolsos | Regras de alto nível definidas pelo CTO; execução não comprovada | Provedor, jurídico, máquina de estados e conciliação | Bloqueado |
| Destaques/impulsionamento | Catálogos de demonstração encontrados | Modelo comercial, cobrança e regras antiabuso | A aprovar |
| Administração, auditoria e moderação | Não foi localizada especificação formal | RBAC, trilhas, suporte e políticas | A aprovar |
| Observabilidade e recuperação | Não validado | Backend, logs/alertas, runbooks | Pré-requisito operacional |

Nenhum módulo está classificado como “validado” por este Blueprint.

## 8. Arquitetura — estado observado versus direção proposta

**Estado observado:** frontend Vite + React + TypeScript; componentes UI; estado de aplicação em contexto React; persistência demonstrativa em `localStorage`; dados de exemplo em `src/lib/mockData.ts`. O manifesto declara dependências de Supabase e Stripe, mas isso isoladamente não comprova integração funcional. Nenhum esquema Supabase foi verificado nesta DOC-02. As alterações técnicas da EXEC-01 existem em branch separada e aguardam testes; não são consideradas validadas.

**Arquitetura proposta para aprovação:**
- Frontend: React/Vite como cliente sem autoridade para decidir preço, autorização, pagamento ou repasse.
- Backend confiável: API/serviços server-side para identidade, autorização, catálogo, disponibilidade, reservas, pagamentos, webhooks, conciliação, cancelamentos, reembolsos e repasses.
- Persistência: banco relacional transacional; Supabase/PostgreSQL é opção a validar, não esquema existente comprovado.
- Provedor: Asaas em Sandbox até autorização posterior do CTO; nenhuma credencial deve ser armazenada no frontend.
- Deploy: Preview para revisão, produção somente após gates e autorização explícita.
- Integrações: contratos versionados, timeouts, retry controlado, idempotência, reconciliação e logs sem dados sensíveis.

Ver detalhes propostos em [Arquitetura de Backend](BACKEND_ARCHITECTURE.md) e [Regras Financeiras](FINANCIAL_RULES.md).

## 9. Segurança, privacidade e isolamento

Requisitos propostos, não comprovados:
- Autenticação confiável e gestão segura de sessão.
- Autorização por recurso e ação no backend, com negação por padrão.
- Isolamento entre participantes, casas e operadores; testes negativos entre tenants/contas.
- Segredos apenas em mecanismos apropriados de ambiente/secret manager; nunca no cliente, repositório, documentação ou logs.
- Minimização de dados, base legal/consentimentos aplicáveis, retenção, exportação e exclusão conforme obrigações legais.
- Proteção contra abuso, enumeração de IDs, XSS/CSRF conforme arquitetura, injeção, rate abuse e uploads maliciosos.
- Auditoria de ações administrativas e financeiras, com acesso restrito e política de retenção.
- Plano de resposta a incidentes e recuperação.

**Risco demonstrado no protótipo:** `localStorage` e `mockData.ts` contêm credenciais fictícias em texto simples e `AppContext.tsx` implementa comportamento local. Isso não deve ser reutilizado como autenticação ou armazenamento de produção.

## 10. Requisitos não funcionais, erros e operação

Propostas para aprovação:
- Integridade transacional de reservas, pagamentos, comissões e repasses.
- Idempotência em operações repetidas e webhooks; proteção contra duplicidade.
- Observabilidade com correlação de requisições e eventos; logs sem tokens, segredos ou dados desnecessários.
- Erros claros para usuário, detalhes técnicos restritos aos logs autorizados.
- Backups, RPO/RTO, recuperação testada e procedimento de reconciliação.
- Acessibilidade, responsividade, desempenho e compatibilidade definidos por critérios mensuráveis.
- Testes unitários, integração, contrato, segurança, regressão e ponta a ponta conforme risco.
- Ambientes separados para desenvolvimento, Preview, Sandbox e produção.

Metas numéricas de disponibilidade, latência, RPO/RTO, retenção e cobertura de testes **não foram recuperadas** e não são inventadas aqui.

## 11. Critérios de aceite transversais propostos

Um requisito só pode ser marcado como validado quando houver: (1) implementação identificada; (2) teste reproduzível; (3) resultado/log ou evidência vinculada ao commit; (4) verificação de regressão e segurança pertinente; (5) aprovação exigida registrada. Documento escrito, mockup, dependência instalada ou teste planejado não equivale a implementação validada.

## 12. Decisões pendentes do CTO

1. Aprovar ou corrigir a formulação de propósito, públicos e perfis.
2. Aprovar módulos de lançamento e prioridades.
3. Aprovar os ciclos de vida e transições de evento/reserva/pagamento/repasse.
4. Confirmar regras de verificação de casas, moderação e conteúdo.
5. Aprovar a arquitetura backend proposta, provedor de identidade e escolha/uso de Supabase.
6. Confirmar políticas de privacidade, retenção, exclusão e auditoria.
7. Aprovar critérios não funcionais mensuráveis.
8. Validar juridicamente termos comerciais, cancelamentos, reembolsos, split e prazo de repasse.
9. Aprovar fases propostas do Roadmap antes de tratá-las como baseline oficial.
10. Manter EXEC-01 aberta até testes verificáveis; não iniciar EXEC-02 sem autorização.

## 13. Mapeamento de identificadores

Os IDs de requisitos utilizados pela matriz oficial desta baseline estão definidos em [TRACEABILITY.md](TRACEABILITY.md). As referências financeiras `FIN-01` a `FIN-05` e `SEC-SECRET-01` são detalhadas em [FINANCIAL_RULES.md](FINANCIAL_RULES.md); os requisitos técnicos e operacionais propostos são detalhados em [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md). As fases `P-*` são propostas documentais definidas em [ROADMAP.md](ROADMAP.md), não fases históricas nem aprovadas.

## 14. Estado de produto

| Dimensão | Estado nesta baseline |
|---|---|
| Planejado | Conceitos descritos como proposta/decisão de alto nível, conforme rótulo em cada seção |
| Implementado | UI, tipos e comportamentos locais de demonstração observados nos arquivos citados |
| Validado | Nenhum fluxo de produção validado por esta DOC-02 |
| Bloqueadores | Autenticação server-side, backend, esquema de dados verificado, segurança, pagamentos reais, testes e decisões do CTO |

**Este Blueprint está submetido para revisão. Não é declaração de aprovação oficial nem autorização de implementação.**


## DOC-03 — Regra financeira vinculante aprovada pelo CTO

A ordem DOC-03 substitui qualquer hipótese anterior incompatível neste Blueprint ou nos documentos relacionados. A comissão da plataforma é 17% do valor bruto e o direito bruto da casa é 83% do valor bruto. As taxas do provedor são despesa da plataforma e não reduzem os 83% da casa. A reserva de 2% permanece dentro dos 17%, não é cobrança adicional; sua base exata e finalidade contábil ainda exigem decisão complementar antes de codificação.

A elegibilidade de repasse ocorre somente após 72 horas do encerramento efetivo do evento, com fuso `America/Sao_Paulo`, e após revisão de reembolsos, contestações e saldo realmente disponível. O prazo não é contado desde o pagamento. Cada movimento deve ser registrado em centavos inteiros e rastreado em ledger. Regras operacionais detalhadas e casos excepcionais estão em [FINANCIAL_RULES.md](FINANCIAL_RULES.md).

**Estado:** regra de negócio financeira APROVADA-CTO; implementação e adequação do provedor PENDENTES. O Asaas é prioritário para avaliação, sem pressupor split, escrow, retenção, reembolso ou transferência não comprovados. A especificação documental não autoriza cobrança, movimentação financeira ou integração real.

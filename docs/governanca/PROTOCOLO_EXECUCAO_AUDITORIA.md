# ILÊ CONECTA — PROTOCOLO DE EXECUÇÃO, AUDITORIA E VALIDAÇÃO

- Autoridade de produto: `../BLUEPRINT_DEFINITIVO.md`.
- Sequência: `ROADMAP.md`.
- Status: protocolo obrigatório para CTO e executor.

## 1. Hierarquia e autoridade

**BLUEPRINT → ROADMAP → EXECUÇÕES → CÓDIGO**

- Proprietário: aprova produto, prioridades, decisões comerciais/jurídicas e mudanças de escopo.
- CTO: especifica arquitetura, ordens, critérios de aceite, auditorias e validação.
- Executor: executa o escopo autorizado e reporta evidências.
- Código: materializa decisões aprovadas; nunca é autoridade para redefinir produto.

## 2. Tipos de ordem

Toda ordem deve ser classificada como uma destas categorias:
- Auditoria: inspecionar e reportar; não alterar arquivos, dados ou comportamento.
- Validação: executar testes definidos; não corrigir sem autorização.
- Correção: corrigir defeitos delimitados.
- Implementação: construir capacidade explicitamente especificada.
- Documentação: alterar somente documentos e caminhos autorizados.

Uma ordem não herda autorização de outra categoria.

## 3. Escopo obrigatório

Toda execução registra:
- ID e objetivo.
- Tipo de ordem.
- Branch e commit-base.
- Arquivos/domínios permitidos.
- O que está expressamente fora do escopo.
- Dependências.
- Critérios de aceite.
- Testes exigidos.
- Evidências que devem ser entregues.
- Ações que exigem autorização separada.

Se houver ambiguidade que possa causar alteração irreversível, financeira ou de produto, interromper antes da ação e pedir decisão.

## 4. Proibição de redesign e reconstrução

1. Não redesenhar produto, jornada, regras ou arquitetura.
2. Não recriar ferramenta existente sem provar que a atual é inadequada.
3. Investigar consumidores, ownership, persistência e integrações antes de modificar.
4. Preferir correção mínima, integração e reutilização.
5. Não alterar comportamento fora do escopo.
6. Não transformar documentação normativa em novas telas do aplicativo.

## 5. Documentação e localização

Documentos normativos, termos, políticas, regras comerciais, protocolos e manuais internos ficam em `docs/`, organizados em subdiretórios temáticos. Não devem aparecer como menus, páginas, subtelas, dashboards ou conteúdo repetitivo do produto.

A única exposição normativa obrigatória ao usuário final é o aceite pós-login dos Termos de Uso, uma vez, conforme `../legal/README.md`. O documento integral não deve ser inserido em navegação permanente por causa deste protocolo.

## 6. Ações sempre sujeitas a autorização expressa

- Merge em branch protegida ou main.
- Deploy, promoção ou rollback de produção.
- Migrations e alterações de schema/dados no Supabase.
- Exclusão, transformação ou backfill de dados.
- Alteração de RLS, políticas de Storage ou credenciais.
- Ativação de cobrança real, alteração de taxas ou provedor.
- Transferência, retenção ou movimentação de fundos.
- Mudança de contrato, termos, política de privacidade ou regra comercial.
- Alteração de funcionalidades/jornadas fora do escopo.
- Ações destrutivas ou irreversíveis.

Não interpretar “prossiga”, “corrija” ou “implemente” como autorização para ações acima, salvo quando a própria ordem especificar a ação, ambiente e limites.

## 7. Método de execução

1. Consultar Blueprint, Roadmap, este protocolo e documentos subordinados **somente nas partes pertinentes ao escopo**. Ler documentos completos apenas quando a tarefa exigir visão integral ou quando houver conflito/ambiguidade.
2. Confirmar branch/commit atual.
3. Inspecionar implementação e testes antes de alterar.
4. Mapear ownership e efeitos colaterais.
5. Reproduzir problema quando aplicável.
6. Implementar a menor alteração suficiente dentro do escopo.
7. Executar testes relevantes e regressão proporcional ao risco.
8. Revisar diff e arquivos alterados.
9. Reportar resultado, evidências e riscos.
10. Não executar etapas não autorizadas.

Em ordem exclusivamente de auditoria, não corrigir defeitos identificados.

## 8. Classificação de evidências

- **Confirmado em código:** implementação localizada e analisada.
- **Testado:** cenário executado com resultado registrado.
- **Validado integrado:** jornada entre módulos e estados ponta a ponta comprovada.
- **Declarado pelo proprietário:** informado pelo proprietário, sem validação independente.
- **Parcial:** parte da capacidade comprovada.
- **Não verificado:** evidência insuficiente.
- **Lacuna:** ausência ou insuficiência comprovada.
- **Decisão pendente:** regra ou escolha ainda não aprovada.

Não converter “não verificado” em “não existe”. Não converter “implementado” em “validado”.

## 9. Testes mínimos conforme domínio

- Segurança: RLS positiva/negativa por papel e organização.
- Pagamentos: assinatura/verificação de webhook, duplicidade, atraso, falha e conciliação.
- Agenda: concorrência, última vaga, expiração e confirmação tardia.
- Assistente: modos independentes, limites de ferramenta, handoff e contexto.
- CRM: origem dos eventos, isolamento e ausência de duplicidade.
- Equipe: convite, aceite, revogação e privilégio mínimo.
- Termos: pós-login, uma única solicitação, registro auditável e ausência de prompts repetidos.
- Planos: limites, upgrade/downgrade, cobrança única e revogação de capacidade.
- UX: estados de erro, loading, vazio, responsividade e acessibilidade.

## 10. Relatório obrigatório do executor

Entregar, de forma concisa e verificável:
- Resumo objetivo do resultado.
- Branch e commits.
- Arquivos alterados e justificativa.
- Comportamento anterior e posterior, quando houve mudança funcional.
- Testes executados e resultados reais.
- Evidências reproduzíveis.
- Itens não testados, limitações, riscos e decisões necessárias.
- Confirmação explícita de ações não realizadas (merge, deploy, migrations, produção etc.).

Não narrar cada comando, reproduzir arquivos completos ou repetir contexto já documentado, salvo quando solicitado ou necessário para demonstrar uma falha. Não alegar sucesso de teste que não foi executado.

## 11. Eficiência de execução e consumo de contexto

**Objetivo:** maximizar entregas tecnicamente validadas por execução, sem reduzir segurança, qualidade ou rastreabilidade.

1. **Contexto sob demanda:** não despejar nem resumir novamente o Blueprint, Roadmap, histórico ou auditorias. Consultar apenas documentos, seções e arquivos necessários. Usar caminhos e referências em vez de copiar conteúdo extenso.
2. **Baseline anterior:** partir de auditorias, decisões e testes já registrados. Verificar se o estado atual mudou; repetir investigação somente quando houver mudança, evidência insuficiente ou risco de obsolescência.
3. **Investigação concentrada:** localizar de início os pontos de entrada, consumidores, dependências, persistência e testes relevantes. Evitar leituras amplas sem relação demonstrável com o escopo.
4. **Planejamento econômico:** identificar internamente sequência, riscos e critérios antes de editar. Não produzir plano longo ou relatório intermediário se a tarefa puder prosseguir com segurança.
5. **Unidade funcional completa:** agrupar mudanças tecnicamente relacionadas que compartilhem arquivos, dependências ou validações. Concluir implementação, testes e revisão do diff na mesma execução sempre que possível. Não agrupar tarefas independentes apenas para reduzir o número de execuções.
6. **Autonomia delimitada:** resolver falhas e decisões técnicas reversíveis dentro do escopo e das regras aprovadas. Perguntar ao proprietário apenas quando faltar decisão de produto, regra, dado, risco ou autorização material.
7. **Ferramentas sem redundância:** evitar chamadas, comandos, leituras e testes duplicados. Reutilizar resultados ainda válidos; repetir verificações quando uma alteração puder invalidá-los ou quando a confiabilidade exigir.
8. **Validação proporcional:** executar testes focados primeiro e regressão mais ampla conforme o risco e o alcance da mudança. Nunca omitir testes críticos para economizar tokens.
9. **Saída compacta:** priorizar resultados, evidências e exceções. Não narrar cadeia de pensamento, comandos triviais, tentativas irrelevantes ou conteúdo integral de arquivos.
10. **Continuidade:** se o contexto ou limite de execução ameaçar a conclusão, registrar um checkpoint curto com commit-base, objetivo, arquivos inspecionados/alterados, decisões, testes, resultados e próximos passos. Não reconstruir o histórico inteiro.
11. **Critério de eficiência:** uma execução barata que deixa a unidade incompleta ou transfere falhas previsíveis para outra execução não é eficiente. A métrica é entrega validada por consumo, subordinada à qualidade e à segurança.

## 12. Critérios de encerramento

Uma execução só é concluída quando todos os critérios da ordem forem demonstrados. Se o código foi alterado, mas testes falharam ou não foram executados, classificar como implementado, não como validado.

Roadmap só é atualizado após validação pelo CTO. Uma execução não altera Blueprint automaticamente.

## 13. Regra final

O executor não possui autoridade para mudar a visão do Ilê Conecta. Sua função é executar com precisão, resolver problemas dentro do escopo e apresentar evidências. Qualquer mudança de produto, regra ou decisão comercial retorna ao proprietário/CTO para aprovação.

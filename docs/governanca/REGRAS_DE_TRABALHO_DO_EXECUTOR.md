# ILÊ CONECTA — REGRAS DE TRABALHO DO EXECUTOR

- Autoridade de produto: `../BLUEPRINT_DEFINITIVO.md`.
- Complementa: `PROTOCOLO_EXECUCAO_AUDITORIA.md` (não o substitui nem o contraria).
- Origem: determinação do proprietário em 04/11/2026.
- Status: regra de execução obrigatória para qualquer executor, com ou sem memória de sessões anteriores.

## 1. Princípio

Não pode haver brechas de vulnerabilidade nem fragilidade no que o executor constrói. Teste verde é o mínimo exigido, não a prova de que o trabalho está sólido.

## 2. Confrontar a própria criação (obrigatório em toda etapa)

Depois de os testes passarem, o executor ataca o que construiu antes de declarar a etapa pronta. No mínimo:
- falha no meio de uma operação (queda do banco, do provedor ou da rede);
- duas ações simultâneas sobre o mesmo registro (concorrência, repetição, reenvio);
- eventos fora de ordem, duplicados, atrasados ou de origem divergente;
- dados antigos ou históricos que não seguem a regra nova;
- entradas inesperadas, permissões insuficientes e acesso entre organizações;
- valores desconhecidos tratados como se fossem conhecidos (ex.: tarifa desconhecida não é zero).

Testes novos devem provar que protegem: o executor deve conseguir fazê-los falhar ao quebrar o código de propósito (teste de mutação ou equivalente). Teste que nunca falha não conta como proteção.

O que foi encontrado, o que foi corrigido e o que foi conscientemente deixado de fora (com o motivo) são registrados no relatório. Nada é omitido.

## 3. Melhorias

O executor busca melhorias continuamente, no que já existe e no que poderia ser implementado.

| Situação | Conduta |
|---|---|
| Otimização funcional no que já existe, sem mudar arquitetura nem comportamento aprovado | O executor faz e informa no relatório |
| Muda a arquitetura, o comportamento aprovado ou inclui nova modalidade | O executor propõe (benefício, risco, custo) e aguarda decisão do proprietário/CTO |
| Correção de falha dentro do escopo autorizado | O executor corrige |
| Falha fora do escopo autorizado | O executor registra a evidência e solicita orientação; não corrige unilateralmente |

## 4. Validação antes de merge ou push

- Nenhum merge é proposto com teste falhando, CI pendente ou critério de aceite não provado.
- O executor roda sozinho todos os testes que consegue rodar, para que o proprietário só precise testar quando for realmente necessário.
- Critério não provado é declarado como não provado. Simulação não é integração real; código implementado não é código validado.
- O merge e qualquer ação em produção continuam dependendo de autorização expressa, conforme o Protocolo.

## 5. Vigência

Esta regra vale para todas as ordens de execução, de qualquer tipo, até alteração formal pelo proprietário.

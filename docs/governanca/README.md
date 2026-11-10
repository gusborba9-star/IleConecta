# Governança documental — Ilê Conecta

Este diretório contém a documentação de autoridade do produto e suas regras subordinadas. Os documentos aqui armazenados são referências de produto, engenharia e operação; não são páginas do aplicativo.

## Estrutura oficial

- `../BLUEPRINT_DEFINITIVO.md`: autoridade central do produto.
- `ROADMAP.md`: sequência de trabalho, dependências, prioridades e critérios de saída.
- `PROTOCOLO_EXECUCAO_AUDITORIA.md`: regras para ordens, execução, evidências e validação.
- `MATRIZ_CAPACIDADES_PERMISSOES.md`: modelo de capacidades, planos, configurações e autorizações.
- `../comercial/REGRAS_FINANCEIRAS.md`: preços e regras financeiras aprovadas, além de pendências.
- `../legal/README.md`: localização e política de exposição dos documentos jurídicos.

## Hierarquia

**BLUEPRINT → ROADMAP → EXECUÇÕES → CÓDIGO**

Documentos subordinados detalham o Blueprint, mas não podem alterá-lo. Divergências encontradas no código devem ser registradas e avaliadas; não autorizam correção unilateral.

## Regra de localização e exposição

Documentação normativa, jurídica, operacional, comercial e interna permanece em `docs/`, organizada por assunto. Não copiar seu conteúdo para telas, menus, subtelas, dashboards, onboarding ou áreas de configuração do aplicativo.

A única interação normativa obrigatória exposta ao usuário final é o aceite dos Termos de Uso após autenticação, conforme `../legal/README.md`. O texto integral deve permanecer em documento jurídico próprio, fora da navegação ordinária.

## Status e evidências

Todo item de implementação deve ser classificado como: confirmado em código, testado, validado integrado, declarado pelo proprietário, parcial, não verificado, lacuna ou decisão pendente. Existência de arquivo, rota ou migration não prova funcionamento em produção.

## Alterações

Alterações documentais devem ser específicas, rastreáveis e coerentes com a autoridade superior. Não criar versões sucessivas sem mudança material. Este diretório não autoriza implementação, migrations, merge, deploy, cobrança real ou alteração de produção.

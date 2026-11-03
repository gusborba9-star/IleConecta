# Documentação jurídica e política de exposição — Ilê Conecta

## 1. Localização oficial

Todos os documentos jurídicos e normativos ficam neste diretório, fora da árvore de componentes e rotas do aplicativo:

- Termos de Uso.
- Política de Privacidade.
- Regras de uso e convivência.
- Política de cancelamento e reembolso.
- Contratos e condições aplicáveis às casas.
- Avisos e documentos de consentimento específicos, quando juridicamente necessários.
- Histórico de versões e aprovações.

Documentos internos de governança, operação, execução e regras financeiras permanecem nos diretórios temáticos correspondentes dentro de `docs/`.

## 2. Regra de exposição no produto

**Não criar telas, páginas, menus, subtelas, itens de navegação, cards, dashboards ou seções de configurações para exibir normas, regras de uso, protocolos ou documentação interna.**

A única exposição normativa obrigatória no fluxo comum do usuário é a apresentação dos Termos de Uso para aceite após o login, uma única vez por conta, segundo a especificação `POLITICA_ACEITE_TERMOS.md`.

O conteúdo jurídico deve ser mantido como documento versionado neste diretório. A interface de aceite apresenta o texto vigente necessário à decisão do usuário, sem transformar o restante da documentação em navegação do produto.

## 3. Momento do aceite

- O usuário realiza autenticação.
- Se ainda não existir aceite registrado para sua conta, a aplicação apresenta o fluxo de aceite dos Termos antes de liberar o uso autenticado.
- Se o aceite já estiver registrado, o usuário segue diretamente para o ambiente autorizado, sem nova solicitação.
- O aceite não deve aparecer repetidamente em cada login, sessão, dispositivo ou mudança de rota.

## 4. Registro mínimo

O registro deve permitir comprovar quem aceitou, qual versão, quando e por qual fluxo. O backend é a autoridade; armazenamento apenas no navegador não é prova suficiente.

Dados mínimos: identificador do usuário, identificador imutável da versão dos Termos, timestamp do servidor, versão/hash do documento e evento de aceite. Metadados técnicos adicionais devem respeitar necessidade e LGPD.

## 5. Atualizações

Correções editoriais que não alterem direitos, obrigações ou finalidades não devem gerar novo prompt de aceite.

Alterações materiais devem passar por revisão jurídica e aprovação do proprietário. Novo aceite só poderá ser solicitado se houver exigência legal/contratual ou decisão formal expressa; não usar atualizações rotineiras para reabrir o aceite. O comportamento padrão é um único aceite e nenhuma repetição.

## 6. Privacidade e segurança

- Não coletar dados além do necessário para demonstrar o aceite.
- Não registrar conteúdo de documentos pessoais em logs.
- Restringir leitura e alteração dos registros.
- Preservar histórico de versões.
- Impedir que o cliente falsifique, altere ou apague o próprio aceite.
- Não condicionar consentimentos opcionais ao aceite dos Termos.
- Não confundir aceite contratual com consentimento LGPD para finalidades opcionais.

## 7. Limite jurídico

Este diretório organiza documentos; não substitui parecer jurídico. A redação final dos Termos, Política de Privacidade e regras de cancelamento/reembolso deve ser revisada por advogado antes de operação comercial pública.

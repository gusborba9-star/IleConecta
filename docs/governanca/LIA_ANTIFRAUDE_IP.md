# Avaliação de Legítimo Interesse (LIA) — Antifraude com IP, aparelho e CPF/CNPJ

Documento interno (não é publicado no app). Guardar para o caso de a ANPD pedir. Revisar sempre que a regra mudar.
Redigido em 24/11/2026 com base na orientação do advogado e no que está implementado.

**Atividade:** prevenção a fraudes, uso abusivo e criação múltipla de contas, cruzando o endereço IP de acesso (com data e hora), o código técnico anônimo do dispositivo e o CPF/CNPJ já informado ao contratar plano.
**Base legal:** art. 7º, IX, da LGPD (legítimo interesse). O IP também é guardado para cumprir as obrigações legais aplicáveis aos provedores de aplicações, quando o operador for pessoa jurídica (Marco Civil, art. 15).

## 1. Finalidade e legitimidade
O interesse é real e lícito: proteger a integridade da plataforma, garantir isonomia entre as Casas e prevenir fraudes, criação automatizada de contas e abuso de benefícios e regras contratuais.

## 2. Necessidade e minimização
Sem o cruzamento do IP, do aparelho e do documento, não há como perceber que o mesmo agente cria várias contas para burlar os Termos. Nada novo é coletado: os dados já existiam para outras finalidades (segurança, registros de acesso, cobrança). Não há geolocalização exata nem dado sensível neste fluxo.

## 3. Balanceamento e impacto ao titular
O impacto sobre o usuário legítimo é mínimo e controlado:
- IP usado por mais de 10 contas (rede móvel e Wi-Fi compartilhado) é ignorado;
- o painel da administração não mostra o IP nem o CPF/CNPJ: mostra só o motivo ("mesmo aparelho", "mesma rede", "mesmo CPF/CNPJ");
- não existe bloqueio automático: o sistema só sinaliza, e qualquer suspensão passa por análise humana;
- IP sozinho nunca fundamenta suspensão; mais de uma Casa com o mesmo responsável pode ser legítima.

## 4. Transparência e salvaguardas
Finalidade e prazos estão na Política de Privacidade (registros de acesso: 6 meses com exclusão automática; registros de segurança e dispositivos: 12 meses sem uso; alertas de segurança: 24 meses). Os Termos garantem o direito de contestar a suspensão por chamado de suporte.

## Fora do escopo por ora
- Guardar hash de IP de fraude comprovada por 12 meses: o advogado confirmou que pode, mas **não está implementado**. Só entra na Política e na tabela de retenção quando for construído.
- Impressão do cartão e vínculo do plano ao pagador: decidido não fazer agora.
- Limite temporário de cadastros por rede: previsto nos Termos, ainda não implementado.

**Conclusão:** o legítimo interesse prevalece; o tratamento é proporcional, seguro e compatível com a LGPD.

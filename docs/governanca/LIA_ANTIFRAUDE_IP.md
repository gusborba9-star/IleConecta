# Avaliação de Legítimo Interesse (LIA) — Antifraude com IP, aparelho, CPF/CNPJ e cartão

Documento interno (não é publicado no app). Guardar para o caso de a ANPD pedir. Revisar sempre que a regra mudar.
Redigido em 24/11/2026 com base na orientação do advogado e no que está implementado; atualizado no mesmo dia com a chave do cartão e o limite de cadastros por rede.

**Atividade:** prevenção a fraudes, uso abusivo e criação múltipla de contas, cruzando o endereço IP de acesso (com data e hora), o código técnico anônimo do dispositivo, o CPF/CNPJ já informado ao contratar plano e um código irreversível (hash) da impressão do cartão de pagamento; e, no cadastro, um limite temporário por rede.
**Base legal:** art. 7º, IX, da LGPD (legítimo interesse). O IP também é guardado para cumprir as obrigações legais aplicáveis aos provedores de aplicações, quando o operador for pessoa jurídica (Marco Civil, art. 15).

## 1. Finalidade e legitimidade
O interesse é real e lícito: proteger a integridade da plataforma, garantir isonomia entre as Casas e prevenir fraudes, criação automatizada de contas e abuso de benefícios e regras contratuais.

## 2. Necessidade e minimização
Sem o cruzamento do IP, do aparelho, do documento e do cartão, não há como perceber que o mesmo agente cria várias contas para burlar os Termos. Quase tudo já existia para outras finalidades (segurança, registros de acesso, cobrança). Dois dados são novos e minimizados: o hash da impressão do cartão (nunca número, validade ou nome; 24 meses desde o último uso) e o hash da rede de cada tentativa de cadastro (no máximo 3 dias, só para o limite por hora). Não há geolocalização exata nem dado sensível neste fluxo.

## 3. Balanceamento e impacto ao titular
O impacto sobre o usuário legítimo é mínimo e controlado:
- IP usado por mais de 10 contas (rede móvel e Wi-Fi compartilhado) é ignorado;
- o painel da administração não mostra o IP, o CPF/CNPJ nem a impressão do cartão: mostra só o motivo ("mesmo aparelho", "mesma rede", "mesmo CPF/CNPJ", "mesmo cartão de pagamento");
- o cartão é só sinal para análise humana, nunca nega reembolso nem contratação automaticamente (CDC, art. 49); familiares podem pagar com o mesmo cartão, por isso a administração decide caso a caso (devolve o dinheiro e, se for a mesma Casa, suspende por abuso de direito);
- o limite de cadastros por rede é temporário ("tente mais tarde"), por hora, não bane ninguém e, se falhar, o cadastro segue;
- não existe bloqueio automático: o sistema só sinaliza, e qualquer suspensão passa por análise humana;
- IP sozinho nunca fundamenta suspensão; mais de uma Casa com o mesmo responsável pode ser legítima.

## 4. Transparência e salvaguardas
Finalidade e prazos estão na Política de Privacidade (registros de acesso: 6 meses com exclusão automática; registros de segurança e dispositivos: 12 meses sem uso; alertas de segurança: 24 meses; código do cartão: 24 meses desde o último uso; código da rede do cadastro: até 3 dias). Os Termos garantem o direito de contestar a suspensão por chamado de suporte.

## Fora do escopo por ora
- Guardar hash de IP de fraude comprovada por 12 meses: o advogado confirmou que pode, mas **não está implementado** (decisão de 24/11/2026: o sinal por aparelho, documento e cartão já cobre o caso). Só entra na Política e na tabela de retenção quando for construído, e nunca para IP de rede compartilhada.
- Impressão do CPF/CNPJ de quem paga no Pix: não é coletada; o CPF/CNPJ da casa (já guardado para contratar plano) cobre esse caso.

**Conclusão:** o legítimo interesse prevalece; o tratamento é proporcional, seguro e compatível com a LGPD.

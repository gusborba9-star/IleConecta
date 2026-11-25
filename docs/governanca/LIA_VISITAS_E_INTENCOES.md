# Avaliação de Legítimo Interesse (LIA) — Contagem de visitas e interesse nas páginas das casas

Documento interno (não é publicado no app). Guardar para o caso de a ANPD pedir. Revisar sempre que a regra mudar.
Redigido em 24/11/2026 com base na orientação do advogado e no que está implementado (migração 0219). **A contagem está desligada** (`features.house_signals`) até o proprietário autorizar.

**Atividade:** contar visitas à página da casa, aberturas de serviço ou ritual e compartilhamentos, como totais por casa e por dia, para a casa acompanhar o próprio desempenho.
**Base legal:** art. 7º, IX, da LGPD (legítimo interesse), para usuários com e sem conta.

## 1. Finalidade e legitimidade
Interesse real e lícito: dar às casas indicadores do alcance da própria página (hoje elas só veem o que acontece depois da conversa) e medir a plataforma sem criar perfil de ninguém.

## 2. Necessidade e minimização
Sem alguma contagem não há como saber quantas pessoas viram a página. O tratamento é o mínimo possível: só totais por casa, dia e tipo; a única informação intermediária é uma chave HMAC (dia + casa + conta ou código aleatório do aparelho + segredo do servidor), sem id de usuário, usada apenas para não contar a mesma pessoa duas vezes e apagada ao fim do próprio dia (horário de Brasília). Totais: 13 meses (mesma regra do funil dos anúncios, 0174). Nenhum dado sensível, nenhuma geolocalização, nenhum cruzamento entre dias, entre casas ou com outras bases.

## 3. Balanceamento e impacto ao titular
- Não há perfilamento individual, nem venda ou compartilhamento com terceiros; a casa nunca vê quem visitou.
- O código do aparelho do visitante sem conta é aleatório, vale um dia e serve só para não inflar a contagem ao atualizar a página.
- Não contam a própria casa nem a equipe; "Não rastrear" (DNT) e Controle Global de Privacidade (GPC) desligam a contagem.
- Tetos contra abuso: 20 repetições por pessoa, dia e tipo; 20 mil chaves por casa e dia.
- Enquanto a chave existe (no máximo um dia) ela é dado pseudonimizado; depois de apagada, o que resta (os totais) é dado estatístico anônimo (LGPD, art. 12).

## 4. Transparência e salvaguardas
Seção "Visitas e interesse nas páginas das casas" na Política de Privacidade (finalidade, código diário apagado no fim do dia, 13 meses, DNT/GPC, base legal) e parágrafo nos Termos da Casa (só totais, proibido identificar visitantes, números estimados, sem garantia de exatidão). Orientação do advogado (24/11/2026): base legal adequada; não exige banner de consentimento para esta medição agregada e interna; DNT e GPC bastam como opt-out (um botão próprio é opcional); retenção adequada.

**Conclusão:** o legítimo interesse prevalece; o tratamento é proporcional e compatível com a LGPD.

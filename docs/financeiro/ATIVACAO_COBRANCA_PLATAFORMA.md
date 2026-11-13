# Ativação da cobrança da plataforma às casas (Platform Billing)

Estado em 2026-11-12: motor e tabelas em produção (migrations 0088 a 0090), **cobrança desligada** (`billing_config.enabled = false`), nenhuma casa inscrita, nenhuma fatura emitida. A função `platform-billing` e o painel de administração estão no código; a função só vai ao ar na publicação da etapa.

**Nada abaixo é feito sem autorização explícita do proprietário.** Cada passo de banco vai em passos pequenos, um por vez, conferido por mim antes do próximo.

## O que é independente do Marketplace
A cobrança da plataforma usa a conta Stripe **da própria plataforma** (sem cabeçalho `Stripe-Account`), função, chaves, aviso (webhook) e rotina próprios. A função `payments` (Marketplace, cobrança direta na conta da casa) não é tocada.

## Pré-requisitos (do proprietário)
1. Conta Stripe da plataforma ativa para o Brasil (Pix e cartão habilitados). Pix Automático **não** existe para conta domiciliada no Brasil: o Pix é pago manualmente todo mês; o cartão recorrente guarda o cartão da casa.
2. Decisão sobre CNPJ ou pessoa física na conta Stripe (pendência de lista).
3. Confirmar o teto de Pix por pagamento da conta (cerca de US$ 3.000 por padrão) e, se houver plano anual no futuro, a disponibilidade de parcelamento em reais.

## Passos de ativação (ordem)
1. **Publicar a função.** Depois do merge do PR da etapa: Actions, "Deploy Edge Functions (manual)", função `platform-billing` (e `assistant-chat`, que ganhou o bloqueio por cobrança).
2. **Segredos da função** (Supabase, Edge Functions, Secrets). Nunca no código nem em chat:
   - `PLATFORM_STRIPE_SECRET_KEY`: chave secreta restrita da conta da plataforma (permissões de Checkout Sessions, PaymentIntents e Balance Transactions, leitura).
   - `PLATFORM_STRIPE_WEBHOOK_SECRET`: segredo de assinatura do aviso (passo 4).
   - `APP_URL`: endereço do site (padrão `https://ile-conecta.vercel.app`).
3. **Teste com chave de teste antes da chave real** (modo teste do Stripe): emitir uma fatura de teste, pagar com o cartão de teste e com Pix de teste, conferir fatura `paga`, livro-razão, tarifa e o card da casa sumindo.
4. **Aviso (webhook) no Stripe:** endpoint `https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/platform-billing`, eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Copiar o segredo de assinatura para o segredo do passo 2.
5. **Segredo da rotina (Vault):** criar `platform_billing_cron_secret` com um valor longo e aleatório (só o proprietário o vê). A função `check_platform_billing_cron_secret` já existe e nega sempre enquanto o segredo não existe.
6. **Agendar a conferência diária no provedor** (passo de banco a liberar na ativação): `pg_cron` chamando a função com o cabeçalho `x-platform-billing-secret`. Ela confere pagamentos em andamento e registra tarifas conhecidas depois do pagamento. O motor (`platform_billing_tick`, 06:20 de Brasília) já está agendado e **não depende** do provedor.
7. **Inscrever uma casa de teste** (painel de administração, Cobrança da plataforma) com dia de vencimento e motivo; só então ligar `Cobrança ligada`. Acompanhar a primeira fatura, o aviso 3 dias antes, o pagamento e o desaparecimento do card.
8. **Só depois** inscrever as demais casas, aos poucos.

## Regras já decididas (para conferir na ativação)
Aviso mínimo de 3 dias antes do vencimento; tolerância de 3 dias úteis; suspensão parcial (sem vendas novas, campanhas, destaque, impulsionamento e assistente; ferramentas internas e o que está em andamento continuam); bloqueio total 30 dias depois da suspensão parcial (editável de 7 a 90): a casa sai da descoberta e o painel fica só leitura, mas sempre pode pagar, exportar dados, falar com o suporte e concluir o que já existe. Mensalidades de membros não são bloqueadas. Sem multa, sem juros, sem selo. Nenhuma compensação de fatura contra repasses.

## Como desligar em emergência
Painel de administração, desmarcar `Cobrança ligada` e salvar: o motor deixa de emitir, avisar e suspender, e o nível de todas as casas volta a "em dia" na leitura (as faturas existentes ficam guardadas).

## Ainda não implementado (decidir antes de prometer à casa)
- Cobrança automática do cartão salvo (`card_recurring` hoje só guarda o cartão; a cada mês a casa confirma o pagamento).
- Plano anual (10 meses pelo preço de 12): registrado no Roadmap como ideia futura.
- Pausa de destaque e impulsionamento na vitrine e saída da descoberta no bloqueio total: dependem do fluxo real de compra de destaque e impulsionamento, que ainda não existe (a tabela `boosts` aceita só 3, 7 e 30 dias, e o seletor permite 1 a 90: corrigir junto com esse fluxo).

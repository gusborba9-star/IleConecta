-- PASSO 99: 0091_creditos_de_ia — parte 1 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: créditos de IA (Blueprint §18.3). Pacotes de 80, 200 e 500 respostas, validade de 3 meses, sem devolução, consumo da franquia mensal primeiro e depois do pacote mais antigo,
-- débito único por resposta, avisos aos 80% e 100% da franquia. Compra pela cobrança da plataforma (migrations 0088 a 0090). Nada aqui liga a cobrança: sem billing_config.enabled a compra é recusada.
-- Também corrige um defeito do motor antes da primeira venda avulsa: compra instantânea (créditos, e no futuro destaque e impulsionamento) abandonada não pode virar atraso, aviso nem suspensão.
-- Só mensalidade e vagas extras (kinds 'plan' e 'extra_seat') contam para tolerância, avisos e suspensão. Compra avulsa abandonada é cancelada depois de 2 dias (a página de pagamento dura menos de 24 horas).
-- Estado de produção antes desta migration: nenhuma fatura existe e nenhum pacote existe.

-- ============ 1) pacotes e livro de consumo ============
create table if not exists public.ai_credit_packs (
id uuid primary key default gen_random_uuid(),
house_id uuid not null,
charge_id uuid not null unique references public.platform_charges(id) on delete restrict,
size int not null check (size in (80, 200, 500)),
remaining int not null check (remaining >= 0),
purchased_at timestamptz not null default now(),
expires_at timestamptz not null,
created_at timestamptz not null default now(),
check (remaining <= size),
check (expires_at > purchased_at)
);

create index if not exists ai_credit_packs_house on public.ai_credit_packs (house_id, purchased_at) where remaining > 0;

create table if not exists public.ai_credit_ledger (
id bigint generated always as identity primary key,
house_id uuid not null,
pack_id uuid not null references public.ai_credit_packs(id) on delete restrict,
usage_id uuid not null unique,
created_at timestamptz not null default now()
);

alter table public.ai_credit_packs enable row level security;

alter table public.ai_credit_ledger enable row level security;

drop policy if exists acp_read on public.ai_credit_packs;

create policy acp_read on public.ai_credit_packs for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists acl_read on public.ai_credit_ledger;

create policy acl_read on public.ai_credit_ledger for select to authenticated using (public.is_admin());

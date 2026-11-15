-- PASSO 221: 0114_destaque_e_impulsionamento — parte 1 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0114 — Venda de destaque e impulsionamento (decisões do proprietário, 14/11/2026).
-- Destaque: a casa inteira nas buscas, por cidade, estado ou país, com número máximo de casas por alcance (3 / 6 / 15; editável no admin).
-- Impulsionamento: um serviço ou ritual da casa levado a mais gente na cidade, no estado ou no país (sem limite de vagas).
-- Tempo: o relógio começa na ENTREGA (pagamento validado). Cada dia é um bloco de 24 horas contado dali; o 1º dia já conta como usado.
-- Nova compra do MESMO item e MESMO alcance soma os dias ao final (entra quando a anterior terminar). Itens ou alcances diferentes são compras independentes.
-- Reembolso (até 7 dias do pagamento): devolve (valor pago / dias) x dias que ainda NÃO começaram; o dia em andamento continua até o fim do bloco.
-- Não iniciada = valor integral. A tarifa do provedor não é descontada (a plataforma absorve).
-- Suspensão por falta de pagamento: o relógio pausa e volta a correr quando a casa regulariza. O preço vem sempre do painel (setting pricing), nunca da tela.
-- Compra exige a autorização expressa de início imediato (carimbo de data no banco).

-- ============ 1) vagas do destaque por alcance (editável no admin) ============
create table if not exists public.promo_limits (
scope text primary key check (scope in ('cidade', 'estado', 'pais')),
highlight_slots int not null check (highlight_slots between 1 and 1000),
updated_at timestamptz not null default now()
);

insert into public.promo_limits (scope, highlight_slots) values ('cidade', 3), ('estado', 6), ('pais', 15) on conflict (scope) do nothing;

alter table public.promo_limits enable row level security;

drop policy if exists promo_limits_read on public.promo_limits;

create policy promo_limits_read on public.promo_limits for select to authenticated using (true);

-- ============ 2) compras ============
create table if not exists public.promotions (
id uuid primary key default gen_random_uuid(),
house_id uuid not null references public.houses(id) on delete cascade,
kind text not null check (kind in ('boost', 'highlight')),
scope text not null check (scope in ('cidade', 'estado', 'pais')),
item_type text check (item_type in ('service', 'event')),
item_id uuid,
days int not null check (days between 1 and 90),
amount_cents bigint not null check (amount_cents between 100 and 5000000),
charge_id uuid unique references public.platform_charges(id) on delete restrict,
authorized_at timestamptz not null,
status text not null default 'aguardando' check (status in ('aguardando', 'ativa', 'encerrada', 'reembolsada', 'cancelada')),
starts_at timestamptz,
paused_seconds bigint not null default 0 check (paused_seconds >= 0),
pause_started_at timestamptz,
delivered_at timestamptz,
end_notice_at timestamptz,
city_key text,
state_key text,
country text,
created_at timestamptz not null default now(),
check ((kind = 'boost' and item_id is not null and item_type is not null) or (kind = 'highlight' and item_id is null and item_type is null))
);

create index if not exists promotions_house on public.promotions (house_id, status);

create index if not exists promotions_live on public.promotions (kind, scope, status) where status in ('aguardando', 'ativa');

alter table public.promotions enable row level security;

drop policy if exists promotions_read on public.promotions;

create policy promotions_read on public.promotions for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

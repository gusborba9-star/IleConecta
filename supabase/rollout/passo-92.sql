-- PASSO 92: 0089_cobranca_tentativas_e_card — parte 1 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: Platform Billing — várias páginas de pagamento por fatura (o Pix expira), tarifa registrada depois do pagamento,
-- detecção de pagamento duplicado e a consulta que alimenta o card de aviso da casa. Nada aqui liga a cobrança: billing_config.enabled segue como está.
-- Estado de produção antes desta migration: nenhuma fatura existe (cobrança desligada), então não há dado a converter.

-- ============ 1) histórico de referências do provedor por fatura ============
alter table public.platform_charges add column if not exists paid_ref text;

create table if not exists public.platform_charge_refs (
id bigint generated always as identity primary key,
charge_id uuid not null references public.platform_charges(id) on delete restrict,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
ref text not null check (char_length(ref) between 1 and 200),
created_at timestamptz not null default now(),
unique (provider, ref)
);

create index if not exists platform_charge_refs_charge on public.platform_charge_refs (charge_id);

alter table public.platform_charge_refs enable row level security;

drop policy if exists pcr_read on public.platform_charge_refs;

create policy pcr_read on public.platform_charge_refs for select to authenticated using (public.is_admin());

drop trigger if exists trg_platform_refs_immutable on public.platform_charge_refs;

create trigger trg_platform_refs_immutable before update or delete on public.platform_charge_refs
for each row execute function public.platform_billing_immutable();

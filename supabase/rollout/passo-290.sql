-- PASSO 290: 0134_historico_de_plano_e_dias_de_atividade — parte 1 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0134 — Histórico de plano e dias de atividade (Fase 5). Indicadores exatos para a administração.
-- (a) house_plan_history: toda troca de plano da casa, por qualquer caminho (gatilho em houses). Motivos: inicio, subiu, rebaixou, cancelou, admin.
--     Casas que já existiam entram com uma linha "inicio" no plano de hoje (histórico anterior não existe; é exato daqui para a frente).
-- (b) user_activity_days: um dia por pessoa (data em Brasília), gravado pelo batimento de presença. Sem conteúdo, tela ou horário. Some junto com a conta (anonymize_account) e vai no "baixar meus dados".
-- (c) admin_indicators passa a usar os dois: cancelamentos, conversão e retenção exatas, ativos do período com comparação.
-- Tabelas só pelo servidor: RLS ligada, sem política, sem permissão para anon/authenticated.

-- ============ a) histórico de plano ============
create table if not exists public.house_plan_history (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  from_plan text,
  to_plan text not null,
  reason text not null check (reason in ('inicio', 'subiu', 'rebaixou', 'cancelou', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists house_plan_history_house on public.house_plan_history (house_id, created_at);

create index if not exists house_plan_history_when on public.house_plan_history (created_at);

alter table public.house_plan_history enable row level security;

revoke all on public.house_plan_history from public, anon, authenticated;

create or replace function public.log_house_plan_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare ro int; rn int; v_reason text;
begin
  if tg_op = 'INSERT' then
    insert into public.house_plan_history (house_id, from_plan, to_plan, reason) values (new.id, null, new.plan::text, 'inicio');
    return new;
  end if;
  if new.plan is not distinct from old.plan then return new; end if;
  ro := case old.plan::text when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 else 1 end;
  rn := case new.plan::text when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 else 1 end;
  v_reason := case
    when auth.uid() is not null and public.is_admin() then 'admin'
    when old.plan_revert_at is not null and new.plan_revert_at is null and new.plan is not distinct from old.plan_revert_to then 'admin'  -- fim de degustação dada pela administração
    when new.plan::text = 'gratis' then 'cancelou'
    when rn > ro then 'subiu'
    else 'rebaixou' end;
  insert into public.house_plan_history (house_id, from_plan, to_plan, reason) values (new.id, old.plan::text, new.plan::text, v_reason);
  return new;
end $$;

revoke all on function public.log_house_plan_change() from public, anon, authenticated;

drop trigger if exists trg_houses_plan_history on public.houses;

create trigger trg_houses_plan_history after insert or update of plan on public.houses for each row execute function public.log_house_plan_change();

-- casas que já existiam: uma linha "inicio" no plano de hoje, na data de criação (só se ainda não houver histórico)
insert into public.house_plan_history (house_id, from_plan, to_plan, reason, created_at)
select h.id, null, h.plan::text, 'inicio', h.created_at from public.houses h
 where not exists (select 1 from public.house_plan_history x where x.house_id = h.id);

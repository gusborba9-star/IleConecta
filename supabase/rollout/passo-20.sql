-- PASSO 20 de 23: 0069 a: tabela do histórico, leitura só do dono e proteção contra edição
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 0069 — F6 da auditoria 31.3: trilha de auditoria da equipe da casa (Blueprint §15 e §26).
-- Decisões do proprietário (2026-11-10): o dono da casa vê o histórico da própria equipe; a administração consulta para investigar
-- denúncias e disputas, e cada consulta fica registrada; o histórico é guardado por 12 meses e depois apagado.
-- Registra: convite criado/cancelado, aceite, pausa, reativação, remoção, mudança de permissões e de nome.
-- Não registra conteúdo de conversa nem dado sensível: só quem fez, o que, em quem, quando e a casa.
-- Idempotente: pode rodar mais de uma vez.

create table if not exists public.staff_audit (
  id bigint generated always as identity primary key,
  house_id uuid not null,                       -- sem FK de propósito: o gatilho de remoção também roda quando a casa é apagada
  action text not null check (action in (
    'convite_criado', 'convite_cancelado', 'aceito', 'pausado', 'reativado', 'removido',
    'permissoes_alteradas', 'nome_alterado', 'admin_consultou')),
  actor_id uuid,
  actor_role text not null check (actor_role in ('dono', 'equipe', 'admin', 'sistema', 'outro')),
  target_user_id uuid,
  target_name text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '12 months'
);
create index if not exists staff_audit_house_idx on public.staff_audit (house_id, created_at desc);
create index if not exists staff_audit_purge_idx on public.staff_audit (purge_after);

alter table public.staff_audit enable row level security;
revoke all on table public.staff_audit from public, anon, authenticated;
grant select on table public.staff_audit to authenticated;
-- O dono lê o histórico da própria casa, menos as consultas da administração (não revelar uma investigação em curso).
drop policy if exists staff_audit_owner_read on public.staff_audit;
create policy staff_audit_owner_read on public.staff_audit for select to authenticated
  using (action <> 'admin_consultou' and public.is_house_owner(house_id));

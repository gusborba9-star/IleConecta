-- Fase 3 — Suporte: assistente Conecta (apoio da plataforma).
-- 1) limite de uso por pessoa (anti-abuso e custo); 2) contexto da PRÓPRIA conta, somente leitura, que a assistente usa para orientar.
-- A assistente não tem poder de escrita: abrir chamado é ação da pessoa (botão) ou, só em risco de vida, da função de borda com a identidade da pessoa.

create table if not exists public.conecta_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists conecta_calls_user_at on public.conecta_calls (user_id, at desc);
alter table public.conecta_calls enable row level security;
revoke all on public.conecta_calls from anon, authenticated;

-- Registra a chamada e diz se pode seguir: até 20 por hora e 80 por dia por pessoa.
create or replace function public.conecta_allow(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare h integer; d integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 81));
  select count(*) filter (where at > now() - interval '1 hour'), count(*) into h, d from public.conecta_calls where user_id = p_user and at > now() - interval '1 day';
  if h >= 20 or d >= 80 then return false; end if;
  insert into public.conecta_calls (user_id) values (p_user);
  return true;
end $$;

create or replace function public.purge_conecta_calls()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.conecta_calls where at < now() - interval '3 days' returning 1) select count(*) into n from d;
  return n;
end $$;

-- Só a PRÓPRIA conta, sem dados de terceiros e sem texto livre: tipo, estado e contagens.
create or replace function public.conecta_account_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles; h record;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  select * into p from public.profiles where id = me;
  select id, name, plan into h from public.houses where owner_id = me limit 1;
  return jsonb_build_object(
    'tipo_conta', p.account_type,
    'nome', p.display_name,
    'email_confirmado', exists (select 1 from auth.users u where u.id = me and u.email_confirmed_at is not null),
    'suspensa', public.is_suspended(me),
    'exclusao_agendada', (select d.execute_after from public.account_deletion_requests d where d.user_id = me and d.status = 'pendente'),
    'impedimentos_exclusao', public.account_deletion_blockers(me),
    'casa', case when h.id is null then null else jsonb_build_object('nome', h.name, 'plano', h.plan) end,
    'chamados_abertos', (select count(*) from public.support_case_parties sp join public.support_cases c on c.id = sp.case_id where sp.user_id = me and c.status not in ('resolvido','recusado')),
    'reembolsos_em_andamento', (select count(*) from public.refund_requests f where f.client_id = me and f.status in ('pendente','aprovado')),
    'termos_aceitos', (select count(distinct doc_key) from public.legal_consents where user_id = me));
end $$;

revoke all on function public.conecta_allow(uuid), public.purge_conecta_calls() from public, anon, authenticated;
grant execute on function public.conecta_allow(uuid) to service_role;
revoke all on function public.conecta_account_context() from public, anon;
grant execute on function public.conecta_account_context() to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-conecta-calls', '35 4 * * *', 'select public.purge_conecta_calls()');
  end if;
end $$;

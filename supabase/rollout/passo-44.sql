-- PASSO 44: 0078_chamados_e_casos — parte 1 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0078 — Suporte: chamados e casos (denúncia, conflito, fraude, pagamento, conta, dúvida).
-- Vale para clientes e casas. Cada chamado chega ao painel com os fatos reais da plataforma (foto tirada na abertura e atualizável),
-- as versões das partes e as provas que as próprias partes escolheram enviar. O administrador decide e a decisão fica registrada.
-- Regras: o denunciado nunca vê quem abriu; a parte envolvida só entra no caso quando o administrador pede a versão dela;
-- provas só entram por escolha explícita; o registro de ações do administrador não pode ser alterado nem apagado.
-- É seguro repetir.

-- ============ 1) tipos, prioridade e prazo ============
create or replace function public.add_business_days(p_from timestamptz, p_days integer)
returns timestamptz language plpgsql immutable as $$
declare t timestamptz := p_from; n integer := 0;
begin
  while n < p_days loop
    t := t + interval '1 day';
    if extract(isodow from t at time zone 'America/Sao_Paulo') < 6 then n := n + 1; end if;
  end loop;
  return t;
end $$;

-- tipo -> (prioridade, prazo da 1ª resposta). Fonte única; o painel e os testes leem daqui.
create or replace function public.support_kind_meta(p_kind text)
returns table (priority text, first_response_due timestamptz)
language sql stable set search_path = public as $$
  select m.pr, case m.hrs when 0 then now() when -1 then public.add_business_days(now(), 3) else now() + make_interval(hours => m.hrs) end
  from (values
    ('risco_vida', 'urgente', 0),
    ('golpe_fraude', 'alta', 24), ('abuso', 'alta', 24), ('conteudo_improprio', 'alta', 24), ('informacao_falsa', 'alta', 24),
    ('pagamento', 'alta', 24), ('reembolso', 'alta', 24), ('pedido_reserva', 'alta', 24), ('disputa', 'alta', 24),
    ('conta_acesso', 'alta', 24),
    ('lgpd_dados', 'alta', 360), ('exclusao_dados', 'alta', 360), ('exclusao_conta', 'alta', 360),
    ('duvida', 'normal', -1), ('sugestao', 'normal', -1), ('tecnico', 'normal', -1)
  ) as m(k, pr, hrs) where m.k = p_kind;
$$;

-- ============ 2) tabelas ============
create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('risco_vida','golpe_fraude','abuso','conteudo_improprio','informacao_falsa','pagamento','reembolso','pedido_reserva','disputa','conta_acesso','lgpd_dados','exclusao_dados','exclusao_conta','duvida','sugestao','tecnico')),
  priority text not null check (priority in ('urgente','alta','normal')),
  status text not null default 'aberto' check (status in ('aberto','em_analise','aguardando_pessoa','aguardando_envolvido','resolvido','recusado')),
  opened_by uuid not null references public.profiles(id) on delete cascade,
  subject_user uuid references public.profiles(id) on delete set null,   -- contra quem (quando houver)
  house_id uuid references public.houses(id) on delete set null,
  context_type text check (context_type in ('pedido','reserva','pagamento','conversa','avaliacao','reembolso')),
  context_id uuid,
  conversation_id uuid,   -- conversa entre as partes (guardada enquanto o caso estiver aberto)
  source text not null default 'pessoa' check (source in ('pessoa','assistente','sistema')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  neutral_summary text check (neutral_summary is null or char_length(neutral_summary) <= 1000), -- o que o envolvido enxerga
  first_response_due timestamptz not null,
  first_response_at timestamptz,
  decision text check (decision is null or decision in ('procedente','improcedente','parcial','sem_acao','orientacao')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  purge_after timestamptz,
  check ((context_type is null) = (context_id is null))
);

create index if not exists support_cases_queue on public.support_cases (status, priority, first_response_due);

create index if not exists support_cases_opener on public.support_cases (opened_by, status);

create index if not exists support_cases_subject on public.support_cases (subject_user);

alter table public.support_cases enable row level security;

revoke all on public.support_cases from anon, authenticated;

   -- tudo passa pelas funções

-- quem participa do caso e com que papel
create table if not exists public.support_case_parties (
  case_id uuid not null references public.support_cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('autor','envolvido')),
  invited_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

alter table public.support_case_parties enable row level security;

revoke all on public.support_case_parties from anon, authenticated;

-- conversa do caso: canal 'autor' (autor e admin), 'envolvido' (envolvido e admin), 'interna' (só admin)
create table if not exists public.support_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  channel text not null check (channel in ('autor','envolvido','interna')),
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('parte','admin','sistema','assistente')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_case_messages_case on public.support_case_messages (case_id, created_at);

alter table public.support_case_messages enable row level security;

revoke all on public.support_case_messages from anon, authenticated;

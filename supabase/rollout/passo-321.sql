-- PASSO 321: 0155_saude_da_plataforma_e_alertas — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0155 — Saúde da plataforma: registro de erros e falhas técnicas, painel do dono e alertas no sino.
-- Fase 6 (observabilidade, 17/11/2026). Até aqui nada registrava erros do app, falhas da IA ou das funções do servidor, e ninguém era avisado
-- se uma rotina agendada parasse. Agora:
--  * system_events: erros do app (sem identificar a pessoa), falhas de IA e erros das funções do servidor; guardados por 30 dias.
--  * report_client_error(): o app (logado) relata um erro; texto limpo de e-mails, ids e números longos; limite por pessoa e limite geral por hora.
--  * log_system_event(): as funções do servidor registram falhas (só a chave de serviço).
--  * admin_health(): o painel do dono vê contagens, erros mais frequentes, estado de cada rotina agendada e do banco.
--  * health_check(): a cada 10 minutos confere os sinais e manda um aviso no sino do dono (que também vira push), no máximo um por problema a cada 6 h.
-- Pode rodar de novo sem problema.

create table if not exists public.system_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('erro_app', 'ia_falha', 'funcao_erro')),
  source text not null check (char_length(source) between 1 and 60),
  route text check (route is null or char_length(route) <= 120),
  detail text not null check (char_length(detail) <= 400)
);

create index if not exists system_events_kind_at_idx on public.system_events (kind, at desc);

create index if not exists system_events_at_idx on public.system_events (at);

alter table public.system_events enable row level security;

revoke all on public.system_events from public, anon, authenticated;

-- contador por pessoa e hora só para limitar abuso; não vai para o registro de erros (que não identifica ninguém) e some em 3 horas
create table if not exists public.client_error_throttle (
  user_id uuid not null,
  bucket timestamptz not null,
  n int not null default 0,
  primary key (user_id, bucket)
);

alter table public.client_error_throttle enable row level security;

revoke all on public.client_error_throttle from public, anon, authenticated;

create table if not exists public.health_alerts (
  code text primary key,
  last_sent timestamptz not null default now()
);

alter table public.health_alerts enable row level security;

revoke all on public.health_alerts from public, anon, authenticated;

-- Limpa um texto de erro antes de guardar: sem e-mails, ids, endereços de rede, números longos nem caracteres de controle; tamanho limitado.
create or replace function public.system_text_clean(p_text text, p_max int) returns text
language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(p_text, ''),
    '[[:cntrl:]]+', ' ', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[e-mail]', 'g'),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
    '[0-9]{5,}', '#', 'g'),
    '\s+', ' ', 'g')), greatest(p_max, 1));
$$;

-- Endereço da tela sem consulta, sem #, com ids trocados por :id.
create or replace function public.system_route_clean(p_route text) returns text
language sql immutable set search_path = public as $$
  select left(regexp_replace(regexp_replace(regexp_replace(
    split_part(split_part(coalesce(p_route, ''), '?', 1), '#', 1),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
    '/[0-9]+(/|$)', '/:id\1', 'g'),
    '[[:cntrl:]]+', '', 'g'), 120);
$$;

-- O app (com a pessoa logada) relata um erro. Devolve false quando passou do limite (nada é gravado).
create or replace function public.report_client_error(p_route text, p_message text, p_source text default 'app') returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int; v_msg text; v_src text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  v_msg := public.system_text_clean(p_message, 400);
  if char_length(v_msg) < 2 then return false; end if;
  v_src := public.system_text_clean(coalesce(nullif(p_source, ''), 'app'), 60);
  insert into public.client_error_throttle (user_id, bucket, n) values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id, bucket) do update set n = public.client_error_throttle.n + 1 returning n into v_n;
  if v_n > 20 then return false; end if;
  -- trava geral: uma enxurrada (de contas diferentes) não enche o registro
  if (select count(*) from public.system_events where kind = 'erro_app' and at > now() - interval '1 hour') >= 600 then return false; end if;
  insert into public.system_events (kind, source, route, detail) values ('erro_app', v_src, nullif(public.system_route_clean(p_route), ''), v_msg);
  return true;
end $$;

-- As funções do servidor registram uma falha (só a chave de serviço).
create or replace function public.log_system_event(p_kind text, p_source text, p_detail text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_kind not in ('ia_falha', 'funcao_erro') then raise exception 'Tipo inválido.'; end if;
  if (select count(*) from public.system_events where kind = p_kind and at > now() - interval '1 hour') >= 1000 then return false; end if;
  insert into public.system_events (kind, source, detail)
  values (p_kind, coalesce(nullif(public.system_text_clean(p_source, 60), ''), 'servidor'), coalesce(nullif(public.system_text_clean(p_detail, 400), ''), '(sem detalhe)'));
  return true;
end $$;

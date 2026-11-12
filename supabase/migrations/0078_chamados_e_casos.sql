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
revoke all on public.support_cases from anon, authenticated;   -- tudo passa pelas funções

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

-- provas enviadas pelas partes, sempre por escolha (consent_at obrigatório)
create table if not exists public.support_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('autor','envolvido')),
  bucket text not null default 'report-evidence' check (bucket = 'report-evidence'),
  path text not null check (char_length(path) between 5 and 300),
  note text check (note is null or char_length(note) <= 300),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (case_id, path)
);
alter table public.support_case_evidence enable row level security;
revoke all on public.support_case_evidence from anon, authenticated;

-- fatos reais da plataforma, congelados no momento (admin refaz quando quiser; as versões antigas ficam)
create table if not exists public.support_case_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  taken_by uuid references auth.users(id) on delete set null,
  taken_at timestamptz not null default now(),
  facts jsonb not null
);
alter table public.support_case_snapshots enable row level security;
revoke all on public.support_case_snapshots from anon, authenticated;

-- registro de ações do administrador: só entra, nunca muda nem sai
create table if not exists public.support_case_log (
  id bigserial primary key,
  case_id uuid,   -- sem chave estrangeira de propósito: o registro sobrevive à limpeza do chamado
  actor uuid,
  action text not null,
  reason text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.support_case_log enable row level security;
revoke all on public.support_case_log from anon, authenticated;
create or replace function public.support_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'O registro de suporte não pode ser alterado.';
end $$;
drop trigger if exists trg_support_log_immutable on public.support_case_log;
create trigger trg_support_log_immutable before update or delete on public.support_case_log
  for each row execute function public.support_log_immutable();

-- ============ 3) fatos reais da plataforma ============
-- A pessoa é parte do contexto? (dono do pedido/reserva/pagamento/conversa/avaliação, ou a casa envolvida)
create or replace function public.support_context_parties(p_type text, p_id uuid)
returns table (client_id uuid, house_owner uuid, house_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_type = 'pedido' then
    return query select o.client_id, h.owner_id, h.id from public.service_orders o join public.houses h on h.id = o.house_id where o.id = p_id;
  elsif p_type = 'reserva' then
    return query select r.user_id, h.owner_id, h.id from public.reservations r join public.events e on e.id = r.event_id join public.houses h on h.id = e.house_id where r.id = p_id;
  elsif p_type = 'pagamento' then
    return query select coalesce(r.user_id, o.client_id), h.owner_id, h.id
      from public.payments p
      left join public.reservations r on r.id = p.reservation_id left join public.events e on e.id = r.event_id
      left join public.service_orders o on o.id = p.order_id
      join public.houses h on h.id = coalesce(e.house_id, o.house_id) where p.id = p_id;
  elsif p_type = 'reembolso' then
    return query select f.client_id, h.owner_id, h.id from public.refund_requests f join public.houses h on h.id = f.house_id where f.id = p_id;
  elsif p_type = 'avaliacao' then
    return query select rv.author_id, h.owner_id, h.id from public.reviews rv join public.houses h on h.id = rv.house_id where rv.id = p_id;
  elsif p_type = 'conversa' then
    return query select (select cm.user_id from public.conversation_members cm where cm.conversation_id = p_id and not exists (select 1 from public.houses hh where hh.owner_id = cm.user_id) limit 1),
                        (select h.owner_id from public.conversation_members cm join public.houses h on h.owner_id = cm.user_id where cm.conversation_id = p_id limit 1),
                        (select h.id from public.conversation_members cm join public.houses h on h.owner_id = cm.user_id where cm.conversation_id = p_id limit 1)
      where exists (select 1 from public.conversations c where c.id = p_id);
  end if;
end $$;
revoke all on function public.support_context_parties(text, uuid) from public, anon, authenticated;

-- Fatos: só o que o sistema registrou. Nada de texto livre das partes aqui.
create or replace function public.support_collect_facts(p_type text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pt record; f jsonb := '{}'::jsonb; cid uuid; pay_ids uuid[];
begin
  if p_type is null then return jsonb_build_object('contexto', null); end if;
  select * into pt from public.support_context_parties(p_type, p_id);
  if not found then return jsonb_build_object('contexto', p_type, 'encontrado', false); end if;
  f := jsonb_build_object('contexto', p_type, 'encontrado', true, 'coletado_em', now(),
    'cliente', (select jsonb_build_object('id', pr.id, 'nome', pr.display_name) from public.profiles pr where pr.id = pt.client_id),
    'casa', (select jsonb_build_object('id', h.id, 'nome', h.name, 'plano', h.plan) from public.houses h where h.id = pt.house_id));
  if p_type = 'pedido' then
    f := f || jsonb_build_object('pedido', (select to_jsonb(x) from (select o.id, o.title, o.price_cents, o.status, o.modality, o.scheduled_at, o.created_at, o.started_at, o.finished_at, o.expires_at from public.service_orders o where o.id = p_id) x));
    select array_agg(p.id) into pay_ids from public.payments p where p.order_id = p_id;
  elsif p_type = 'reserva' then
    f := f || jsonb_build_object('reserva', (select to_jsonb(x) from (select r.id, r.status, r.created_at, r.expires_at, e.title as ritual, e.starts_at, e.price_cents from public.reservations r join public.events e on e.id = r.event_id where r.id = p_id) x));
    select array_agg(p.id) into pay_ids from public.payments p where p.reservation_id = p_id;
  elsif p_type = 'pagamento' then
    pay_ids := array[p_id];
  elsif p_type = 'reembolso' then
    select array_agg(rf.payment_id) into pay_ids from public.refund_requests rf where rf.id = p_id and rf.payment_id is not null;
  elsif p_type = 'avaliacao' then
    f := f || jsonb_build_object('avaliacao', (select to_jsonb(x) from (select rv.id, rv.rating, rv.comment, rv.anonymous, rv.reply, rv.hidden, rv.reported_at, rv.report_reason, rv.created_at from public.reviews rv where rv.id = p_id) x));
  end if;
  if pay_ids is not null then
    f := f || jsonb_build_object(
      'pagamentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select p.id, p.status, p.gross_cents, p.fee_cents, p.payment_method, p.confirmed_at, p.created_at from public.payments p where p.id = any (pay_ids)) x), '[]'::jsonb),
      'lancamentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select l.entry_type, l.amount_cents, l.created_at from public.ledger_entries l where l.payment_id = any (pay_ids)) x), '[]'::jsonb),
      'reembolsos', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select rf.id, rf.kind, rf.status, rf.amount_cents, rf.reason, rf.house_response, rf.decision_note, rf.created_at, rf.decided_at from public.refund_requests rf where rf.payment_id = any (pay_ids)) x), '[]'::jsonb));
  end if;
  -- aceites vigentes das duas partes (data e versão; sem IP)
  f := f || jsonb_build_object('aceites', coalesce((select jsonb_agg(to_jsonb(x) order by x.accepted_at) from (
    select c.user_id, c.doc_key, c.doc_version, c.accepted_at from public.legal_consents c where c.user_id in (pt.client_id, pt.house_owner)) x), '[]'::jsonb));
  -- conversa entre as partes (últimas 30), quando existir: abrir um caso autoriza o painel a ver esse trecho
  if p_type = 'conversa' then cid := p_id;
  else
    select cm1.conversation_id into cid from public.conversation_members cm1 join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
     where cm1.user_id = pt.client_id and cm2.user_id = pt.house_owner limit 1;
  end if;
  if cid is not null then
    f := f || jsonb_build_object('conversa', coalesce((select jsonb_agg(to_jsonb(x) order by x.at) from (
      select m.created_at as at, m.sender_id as de, m.from_assistant as assistente, m.staff_name as equipe, m.text as texto, (m.deleted_at is not null) as apagada
        from public.messages m where m.conversation_id = cid order by m.created_at desc limit 30) x), '[]'::jsonb));
  end if;
  return f;
end $$;
revoke all on function public.support_collect_facts(text, uuid) from public, anon, authenticated;

-- ============ 4) abrir chamado ============
create or replace function public.open_support_case(
  p_kind text, p_title text, p_description text,
  p_context_type text default null, p_context_id uuid default null,
  p_subject uuid default null, p_source text default 'pessoa')
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); meta record; cid uuid; pt record; is_party boolean; hid uuid; openn integer; subj uuid := p_subject;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  if p_source not in ('pessoa','assistente') then raise exception 'Origem inválida.'; end if;
  select * into meta from public.support_kind_meta(p_kind);
  if not found then raise exception 'Tipo de chamado inválido.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3 or char_length(p_title) > 120 then raise exception 'Dê um título ao chamado (3 a 120 caracteres).'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 10 or char_length(p_description) > 2000 then raise exception 'Descreva o que aconteceu (10 a 2000 caracteres).'; end if;
  -- limite: 5 abertos por pessoa (risco de vida nunca é barrado)
  select count(*) into openn from public.support_cases where opened_by = me and status not in ('resolvido','recusado');
  if openn >= 5 and p_kind <> 'risco_vida' then raise exception 'Você já tem 5 chamados em aberto. Aguarde a resposta antes de abrir outro.'; end if;
  if (p_context_type is null) <> (p_context_id is null) then raise exception 'Contexto inválido.'; end if;
  if p_context_type is not null then
    select * into pt from public.support_context_parties(p_context_type, p_context_id);
    if not found then raise exception 'Não encontramos o item informado.'; end if;
    is_party := me in (pt.client_id, pt.house_owner) or public.is_admin();
    if not is_party then raise exception 'Você só pode abrir chamado sobre algo em que participa.'; end if;
    hid := pt.house_id;
    -- a outra parte do contexto é o "contra quem" quando não informado
    if subj is null then subj := case when me = pt.client_id then pt.house_owner else pt.client_id end; end if;
  end if;
  if subj = me then subj := null; end if;
  if subj is not null and not exists (select 1 from public.profiles where id = subj) then subj := null; end if;
  insert into public.support_cases (kind, priority, opened_by, subject_user, house_id, context_type, context_id, source, title, description, first_response_due)
  values (p_kind, meta.priority, me, subj, hid, p_context_type, p_context_id, p_source, btrim(p_title), btrim(p_description), meta.first_response_due)
  returning id into cid;
  insert into public.support_case_parties (case_id, user_id, role) values (cid, me, 'autor');
  insert into public.support_case_snapshots (case_id, taken_by, facts) values (cid, null, public.support_collect_facts(p_context_type, p_context_id));
  insert into public.support_case_messages (case_id, channel, author_id, author_role, body) values (cid, 'autor', me, 'parte', btrim(p_description));
  insert into public.support_case_log (case_id, actor, action, data) values (cid, me, 'aberto', jsonb_build_object('tipo', p_kind, 'prioridade', meta.priority, 'origem', p_source));
  -- aviso aos administradores
  insert into public.notifications (user_id, text, href)
    select a.user_id, case meta.priority when 'urgente' then 'URGENTE: ' else 'Novo chamado: ' end || left(btrim(p_title), 80), '/admin?aba=chamados'
      from public.admins a
     where meta.priority in ('urgente','alta');
  return cid;
end $$;

-- ============ 5) o que a pessoa vê e faz ============
create or replace function public.my_support_cases()
returns table (id uuid, kind text, priority text, status text, title text, role text, created_at timestamptz, updated_at timestamptz, decision text)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.priority, c.status, case when p.role = 'autor' then c.title else 'Pedido de esclarecimento' end, p.role, c.created_at, c.updated_at, case when p.role = 'autor' then c.decision end
    from public.support_case_parties p join public.support_cases c on c.id = p.case_id
   where p.user_id = auth.uid()
   order by (c.status in ('resolvido','recusado')), c.updated_at desc limit 100;
$$;

-- Detalhe visto pela pessoa. O envolvido recebe só o resumo neutro, nunca quem abriu nem o texto do autor.
create or replace function public.my_support_case(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text; c public.support_cases;
begin
  select p.role into r from public.support_case_parties p where p.case_id = p_id and p.user_id = me;
  if r is null then raise exception 'Chamado não encontrado.'; end if;
  select * into c from public.support_cases where id = p_id;
  return jsonb_build_object(
    'id', c.id, 'papel', r, 'tipo', c.kind, 'prioridade', c.priority, 'status', c.status, 'criado_em', c.created_at,
    'titulo', case when r = 'autor' then c.title else 'Pedido de esclarecimento' end,
    'resumo', case when r = 'autor' then c.description else c.neutral_summary end,
    'prazo_primeira_resposta', case when r = 'autor' then c.first_response_due end,
    'decisao', case when r = 'autor' then c.decision end,
    'decisao_nota', case when r = 'autor' then c.decision_note end,
    'mensagens', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'de', case when m.author_role = 'parte' and m.author_id = me then 'voce' when m.author_role = 'parte' then 'outra_parte' else m.author_role end, 'texto', m.body, 'em', m.created_at) order by m.created_at)
        from public.support_case_messages m where m.case_id = p_id and m.channel = r), '[]'::jsonb),
    'provas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'path', e.path, 'nota', e.note, 'em', e.created_at) order by e.created_at)
        from public.support_case_evidence e where e.case_id = p_id and e.submitted_by = me), '[]'::jsonb));
end $$;

create or replace function public.add_support_case_message(p_case uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r text; st text; mid uuid; nmsg integer;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  select p.role into r from public.support_case_parties p where p.case_id = p_case and p.user_id = me;
  if r is null then raise exception 'Chamado não encontrado.'; end if;
  select status into st from public.support_cases where id = p_case;
  if st in ('resolvido','recusado') then raise exception 'Este chamado já foi encerrado. Abra um novo se precisar.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(p_body) > 2000 then raise exception 'Escreva a mensagem (até 2000 caracteres).'; end if;
  select count(*) into nmsg from public.support_case_messages where case_id = p_case and channel = r and author_id = me;
  if nmsg >= 100 then raise exception 'Limite de mensagens deste chamado atingido.'; end if;
  insert into public.support_case_messages (case_id, channel, author_id, author_role, body) values (p_case, r, me, 'parte', btrim(p_body)) returning id into mid;
  -- a pessoa respondeu: volta para análise
  update public.support_cases set updated_at = now(), status = case when status in ('aguardando_pessoa','aguardando_envolvido') then 'em_analise' else status end where id = p_case;
  return mid;
end $$;

-- Prova: só entra por escolha explícita (p_consent = true). O arquivo precisa estar na pasta da própria pessoa.
create or replace function public.submit_support_evidence(p_case uuid, p_path text, p_note text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r text; st text; eid uuid; n integer;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  if p_consent is distinct from true then raise exception 'Confirme que você escolhe enviar este arquivo ao suporte.'; end if;
  select p.role into r from public.support_case_parties p where p.case_id = p_case and p.user_id = me;
  if r is null then raise exception 'Chamado não encontrado.'; end if;
  select status into st from public.support_cases where id = p_case;
  if st in ('resolvido','recusado') then raise exception 'Este chamado já foi encerrado.'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> me::text then raise exception 'Arquivo inválido.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'report-evidence' and o.name = p_path) then raise exception 'Arquivo não encontrado. Envie de novo.'; end if;
  select count(*) into n from public.support_case_evidence where case_id = p_case and submitted_by = me;
  if n >= 10 then raise exception 'Limite de 10 arquivos por chamado.'; end if;
  insert into public.support_case_evidence (case_id, submitted_by, channel, path, note) values (p_case, me, r, p_path, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) returning id into eid;
  update public.support_cases set updated_at = now() where id = p_case;
  return eid;
end $$;

drop policy if exists "evidence: admin lê provas de chamado" on storage.objects;
create policy "evidence: admin lê provas de chamado" on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and public.is_admin()
    and exists (select 1 from public.support_case_evidence e where e.path = name));

-- ============ 6) painel do administrador ============
create or replace function public.admin_support_queue(p_status text default null)
returns table (id uuid, kind text, priority text, status text, title text, opener_name text, subject_name text, house_name text, first_response_due timestamptz, first_response_at timestamptz, overdue boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select c.id, c.kind, c.priority, c.status, c.title, po.display_name, ps.display_name, h.name, c.first_response_due, c.first_response_at,
           (c.first_response_at is null and c.status not in ('resolvido','recusado') and c.first_response_due < now()), c.created_at
      from public.support_cases c
      left join public.profiles po on po.id = c.opened_by left join public.profiles ps on ps.id = c.subject_user left join public.houses h on h.id = c.house_id
     where (p_status is null and c.status not in ('resolvido','recusado')) or c.status = p_status
     order by case c.priority when 'urgente' then 0 when 'alta' then 1 else 2 end, c.first_response_due, c.created_at
     limit 200;
end $$;

-- Dossiê: fatos do sistema + versão de cada parte + provas, lado a lado.
create or replace function public.admin_support_dossier(p_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.support_cases; me uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into c from public.support_cases where id = p_id;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason) values (p_id, me, 'dossie_consultado', left(nullif(btrim(coalesce(p_reason, '')), ''), 300));
  return jsonb_build_object(
    'caso', to_jsonb(c) - 'opened_by' - 'subject_user' || jsonb_build_object('aberto_por', c.opened_by, 'contra', c.subject_user),
    'autor', (select jsonb_build_object('id', p.id, 'nome', p.display_name, 'tipo_conta', p.account_type) from public.profiles p where p.id = c.opened_by),
    'envolvido', (select jsonb_build_object('id', p.id, 'nome', p.display_name, 'tipo_conta', p.account_type, 'convidado', exists (select 1 from public.support_case_parties sp where sp.case_id = c.id and sp.user_id = p.id and sp.role = 'envolvido')) from public.profiles p where p.id = c.subject_user),
    'fatos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'em', s.taken_at, 'por', s.taken_by, 'fatos', s.facts) order by s.taken_at) from public.support_case_snapshots s where s.case_id = c.id), '[]'::jsonb),
    'mensagens', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'canal', m.channel, 'de', m.author_id, 'papel', m.author_role, 'texto', m.body, 'em', m.created_at) order by m.created_at) from public.support_case_messages m where m.case_id = c.id), '[]'::jsonb),
    'provas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'enviada_por', e.submitted_by, 'canal', e.channel, 'path', e.path, 'nota', e.note, 'consentimento_em', e.consent_at) order by e.created_at) from public.support_case_evidence e where e.case_id = c.id), '[]'::jsonb),
    'registro', coalesce((select jsonb_agg(jsonb_build_object('em', l.created_at, 'quem', l.actor, 'acao', l.action, 'motivo', l.reason, 'dados', l.data) order by l.id) from public.support_case_log l where l.case_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.admin_support_refresh_facts(p_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.support_cases; sid uuid;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo.'; end if;
  select * into c from public.support_cases where id = p_id;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  insert into public.support_case_snapshots (case_id, taken_by, facts) values (p_id, auth.uid(), public.support_collect_facts(c.context_type, c.context_id)) returning id into sid;
  insert into public.support_case_log (case_id, actor, action, reason) values (p_id, auth.uid(), 'fatos_atualizados', left(btrim(p_reason), 300));
  return sid;
end $$;

-- Responde à parte (canal 'autor' ou 'envolvido') ou anota internamente.
create or replace function public.admin_support_reply(p_case uuid, p_channel text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.support_cases; mid uuid; target uuid;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_channel not in ('autor','envolvido','interna') then raise exception 'Canal inválido.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(p_body) > 2000 then raise exception 'Escreva a mensagem (até 2000 caracteres).'; end if;
  select * into c from public.support_cases where id = p_case;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if p_channel = 'envolvido' and not exists (select 1 from public.support_case_parties where case_id = p_case and role = 'envolvido') then
    raise exception 'A outra parte ainda não foi convidada a dar a versão dela.';
  end if;
  insert into public.support_case_messages (case_id, channel, author_id, author_role, body) values (p_case, p_channel, auth.uid(), 'admin', btrim(p_body)) returning id into mid;
  if p_channel <> 'interna' then
    update public.support_cases set first_response_at = coalesce(first_response_at, now()), updated_at = now(),
      status = case when p_channel = 'autor' and status in ('aberto','em_analise') then 'aguardando_pessoa' when p_channel = 'envolvido' and status in ('aberto','em_analise') then 'aguardando_envolvido' else status end
     where id = p_case;
    select user_id into target from public.support_case_parties where case_id = p_case and role = p_channel limit 1;
    if target is not null then insert into public.notifications (user_id, text, href) values (target, 'O suporte respondeu ao seu chamado.', '/suporte/chamados'); end if;
  else
    update public.support_cases set updated_at = now() where id = p_case;
  end if;
  insert into public.support_case_log (case_id, actor, action, data) values (p_case, auth.uid(), 'resposta_' || p_channel, '{}'::jsonb);
  return mid;
end $$;

-- Pede a versão da outra parte. Ela só vê o resumo neutro escrito pelo administrador.
create or replace function public.admin_support_request_version(p_case uuid, p_neutral_summary text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.support_cases;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_neutral_summary, ''))) < 10 or char_length(p_neutral_summary) > 1000 then raise exception 'Escreva um resumo neutro (10 a 1000 caracteres), sem identificar quem abriu o chamado.'; end if;
  select * into c from public.support_cases where id = p_case;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if c.subject_user is null then raise exception 'Este chamado não tem outra parte.'; end if;
  insert into public.support_case_parties (case_id, user_id, role) values (p_case, c.subject_user, 'envolvido') on conflict (case_id, user_id) do nothing;
  update public.support_cases set neutral_summary = btrim(p_neutral_summary), status = 'aguardando_envolvido', first_response_at = coalesce(first_response_at, now()), updated_at = now() where id = p_case;
  insert into public.support_case_messages (case_id, channel, author_id, author_role, body) values (p_case, 'envolvido', auth.uid(), 'sistema', 'O suporte pediu a sua versão dos fatos. Você pode escrever e, se quiser, enviar arquivos.');
  insert into public.notifications (user_id, text, href) values (c.subject_user, 'O suporte pediu a sua versão sobre um caso. Responda para ser ouvido.', '/suporte/chamados');
  insert into public.support_case_log (case_id, actor, action) values (p_case, auth.uid(), 'versao_solicitada');
end $$;

create or replace function public.admin_support_set_status(p_case uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_status not in ('aberto','em_analise','aguardando_pessoa','aguardando_envolvido') then raise exception 'Use a decisão para encerrar o chamado.'; end if;
  update public.support_cases set status = p_status, updated_at = now() where id = p_case and status not in ('resolvido','recusado');
  if not found then raise exception 'Chamado não encontrado ou já encerrado.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (p_case, auth.uid(), 'status', left(nullif(btrim(coalesce(p_reason, '')), ''), 300), jsonb_build_object('status', p_status));
end $$;

-- Decisão: encerra o chamado, exige motivo, avisa as partes e define a retenção (12 meses; 24 se houver prova ou denúncia).
create or replace function public.admin_support_decide(p_case uuid, p_decision text, p_note text, p_refuse boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare c public.support_cases; keep interval; has_ev boolean;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_decision not in ('procedente','improcedente','parcial','sem_acao','orientacao') then raise exception 'Decisão inválida.'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 or char_length(p_note) > 2000 then raise exception 'Escreva o motivo da decisão (10 a 2000 caracteres).'; end if;
  select * into c from public.support_cases where id = p_case for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if c.status in ('resolvido','recusado') then raise exception 'Este chamado já foi encerrado.'; end if;
  has_ev := exists (select 1 from public.support_case_evidence where case_id = p_case);
  keep := case when has_ev or c.kind in ('golpe_fraude','abuso','conteudo_improprio','informacao_falsa','disputa','risco_vida') then interval '24 months' else interval '12 months' end;
  update public.support_cases set status = case when p_refuse then 'recusado' else 'resolvido' end, decision = p_decision, decision_note = btrim(p_note),
    decided_by = auth.uid(), resolved_at = now(), updated_at = now(), first_response_at = coalesce(first_response_at, now()), purge_after = now() + keep
   where id = p_case;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (p_case, auth.uid(), 'decidido', left(btrim(p_note), 300), jsonb_build_object('decisao', p_decision, 'recusado', p_refuse));
  insert into public.notifications (user_id, text, href)
    select sp.user_id, 'O suporte encerrou o seu chamado.', '/suporte/chamados' from public.support_case_parties sp where sp.case_id = p_case;
end $$;

-- ============ 7) retenção ============
create or replace function public.purge_support_cases()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.support_cases where purge_after is not null and purge_after < now() returning id) select count(*) into n from d;
  return n;
end $$;

-- ============ 8) permissões ============
revoke all on function public.open_support_case(text, text, text, text, uuid, uuid, text), public.my_support_cases(), public.my_support_case(uuid),
  public.add_support_case_message(uuid, text), public.submit_support_evidence(uuid, text, text, boolean),
  public.admin_support_queue(text), public.admin_support_dossier(uuid, text), public.admin_support_refresh_facts(uuid, text), public.admin_support_reply(uuid, text, text),
  public.admin_support_request_version(uuid, text), public.admin_support_set_status(uuid, text, text), public.admin_support_decide(uuid, text, text, boolean),
  public.purge_support_cases(), public.support_kind_meta(text), public.add_business_days(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.open_support_case(text, text, text, text, uuid, uuid, text), public.my_support_cases(), public.my_support_case(uuid),
  public.add_support_case_message(uuid, text), public.submit_support_evidence(uuid, text, text, boolean),
  public.admin_support_queue(text), public.admin_support_dossier(uuid, text), public.admin_support_refresh_facts(uuid, text), public.admin_support_reply(uuid, text, text),
  public.admin_support_request_version(uuid, text), public.admin_support_set_status(uuid, text, text), public.admin_support_decide(uuid, text, text, boolean) to authenticated;

do $$
begin
  perform cron.schedule('purge-support-cases', '15 4 * * *', 'select public.purge_support_cases()');
exception when others then
  raise notice 'pg_cron indisponível: agende purge_support_cases() manualmente';
end $$;

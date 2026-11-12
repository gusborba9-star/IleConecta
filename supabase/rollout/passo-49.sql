-- PASSO 49: 0078_chamados_e_casos — parte 6 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
    'autor', (select jsonb_build_object('id', p.id, 'nome', p.display_name, 'tipo_conta', p.account_type, 'excluida', p.deleted_at is not null,
               'identidade_retida', (select jsonb_build_object('nome', di.display_name, 'email', di.email, 'excluida_em', di.deleted_at) from public.deleted_account_identity di where di.user_id = p.id)) from public.profiles p where p.id = c.opened_by),
    'envolvido', (select jsonb_build_object('id', p.id, 'nome', p.display_name, 'tipo_conta', p.account_type, 'excluida', p.deleted_at is not null,
               'identidade_retida', (select jsonb_build_object('nome', di.display_name, 'email', di.email, 'excluida_em', di.deleted_at) from public.deleted_account_identity di where di.user_id = p.id), 'convidado', exists (select 1 from public.support_case_parties sp where sp.case_id = c.id and sp.user_id = p.id and sp.role = 'envolvido')) from public.profiles p where p.id = c.subject_user),
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

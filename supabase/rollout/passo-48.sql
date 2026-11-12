-- PASSO 48: 0078_chamados_e_casos — parte 5 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

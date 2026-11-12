-- PASSO 47: 0078_chamados_e_casos — parte 4 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fatos: só o que o sistema registrou. Nada de texto livre das partes aqui.
create or replace function public.support_collect_facts(p_type text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pt record; f jsonb := '{}'::jsonb; cid uuid; pay_ids uuid[];
begin
  if p_type is null then return jsonb_build_object('contexto', null); end if;
  select * into pt from public.support_context_parties(p_type, p_id);
  if not found then return jsonb_build_object('contexto', p_type, 'encontrado', false); end if;
  f := jsonb_build_object('contexto', p_type, 'encontrado', true, 'coletado_em', now(),
    'cliente', (select jsonb_build_object('id', pr.id, 'nome', pr.display_name, 'excluida', pr.deleted_at is not null,
                  'identidade_retida', (select jsonb_build_object('nome', di.display_name, 'email', di.email, 'excluida_em', di.deleted_at) from public.deleted_account_identity di where di.user_id = pr.id))
                from public.profiles pr where pr.id = pt.client_id),
    'casa', (select jsonb_build_object('id', h.id, 'nome', h.name, 'plano', h.plan, 'dono_identidade_retida', (select jsonb_build_object('nome', di.display_name, 'email', di.email, 'excluida_em', di.deleted_at) from public.deleted_account_identity di where di.user_id = h.owner_id)) from public.houses h where h.id = pt.house_id));
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
      select m.created_at as at, m.sender_id as de, m.from_assistant as assistente, m.staff_name as equipe, coalesce(a.original_text, m.text) as texto, (m.deleted_at is not null) as apagada
        from public.messages m left join public.message_archive a on a.message_id = m.id where m.conversation_id = cid order by m.created_at desc limit 30) x), '[]'::jsonb));
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
  insert into public.support_cases (kind, priority, opened_by, subject_user, house_id, context_type, context_id, conversation_id, source, title, description, first_response_due)
  values (p_kind, meta.priority, me, subj, hid, p_context_type, p_context_id, public.support_conversation_of(p_context_type, p_context_id), p_source, btrim(p_title), btrim(p_description), meta.first_response_due)
  returning id into cid;
  -- mensagens já apagadas dessa conversa ficam retidas enquanto o caso durar
  update public.message_archive set purge_after = greatest(purge_after, now() + interval '24 months')
   where conversation_id = (select conversation_id from public.support_cases where id = cid);
  insert into public.support_case_parties (case_id, user_id, role) values (cid, me, 'autor');
  insert into public.support_case_snapshots (case_id, taken_by, facts) values (cid, null, public.support_collect_facts(p_context_type, p_context_id));
  insert into public.support_case_messages (case_id, channel, author_id, author_role, body) values (cid, 'autor', me, 'parte', btrim(p_description));
  insert into public.support_case_log (case_id, actor, action, data) values (cid, me, 'aberto', jsonb_build_object('tipo', p_kind, 'prioridade', meta.priority, 'origem', p_source));
  -- aviso aos administradores
  insert into public.notifications (user_id, text, href)
    select a.user_id, case meta.priority when 'urgente' then 'URGENTE: ' else 'Novo chamado: ' end || left(btrim(p_title), 80), '/admin?s=suporte'
      from public.admins a
     where meta.priority in ('urgente','alta');
  return cid;
end $$;

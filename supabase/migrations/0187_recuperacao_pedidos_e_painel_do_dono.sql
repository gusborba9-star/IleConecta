-- 0187 — Recuperação de acesso: gravar pedidos, e-mails de decisão e painel do dono (Blueprint §18).
-- Passo 3b. Funções do servidor = só service_role. Funções do painel = só o dono (admin_can('dono')).

-- Defesa extra: a busca por nome não aceita curinga (% _) vindo de fora.
alter function public.recovery_candidate_facts(text, text, text, text) rename to recovery_candidate_facts_raw;
create or replace function public.recovery_candidate_facts(p_type text, p_name text, p_email_key text, p_city text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.recovery_candidate_facts_raw(p_type, regexp_replace(left(coalesce(p_name, ''), 120), '[^[:alnum:] ]', '', 'g'),
         left(coalesce(p_email_key, ''), 200), regexp_replace(left(coalesce(p_city, ''), 80), '[^[:alnum:] ]', '', 'g'))
$$;
revoke all on function public.recovery_candidate_facts(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_candidate_facts(text, text, text, text) to service_role;

-- Já existe pedido em aberto, ou recusa nos últimos 7 dias, para este contato? (a resposta ao usuário é sempre a mesma)
create or replace function public.recovery_blocked(p_contact_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_recovery_requests r
    where r.contact_email_key = p_contact_key
      and (r.status in ('pendente', 'aprovado', 'confirmacao_enviada')
           or (r.status = 'recusado' and r.decided_at > now() - interval '7 days')))
$$;

-- Grava o pedido já avaliado pelo motor. A palavra de segurança nunca chega aqui.
create or replace function public.recovery_submit(
  p_ip inet, p_contact_email text, p_claimed jsonb, p_answers jsonb, p_round smallint, p_parent uuid,
  p_candidate uuid, p_candidates jsonb, p_word_checked boolean, p_evaluation jsonb, p_recommendation text, p_lane text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_key text := public.email_key(p_contact_email);
begin
  if v_key is null or v_key = '' or position('@' in p_contact_email) < 2 or char_length(p_contact_email) > 254 then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;
  if char_length(coalesce(p_claimed, '{}')::text) > 6000 or char_length(coalesce(p_answers, '{}')::text) > 6000
     or char_length(coalesce(p_evaluation, '{}')::text) > 20000 or char_length(coalesce(p_candidates, '[]')::text) > 4000 then
    raise exception 'conteúdo grande demais' using errcode = '22023';
  end if;
  insert into public.account_recovery_requests (ip, contact_email, contact_email_key, claimed, answers, round, parent_id,
      candidate_user_id, candidates, word_checked, evaluation, recommendation, lane)
  values (p_ip, lower(btrim(p_contact_email)), v_key, coalesce(p_claimed, '{}'), coalesce(p_answers, '{}'), coalesce(p_round, 1), p_parent,
      p_candidate, coalesce(p_candidates, '[]'), p_word_checked, p_evaluation, p_recommendation, coalesce(p_lane, 'normal'))
  returning id into v_id;
  return v_id;
end $$;

-- Aviso ao dono da conta no momento do pedido: no máximo 1 a cada 7 dias por conta. Devolve o e-mail atual da conta (ou null).
create or replace function public.recovery_claim_owner_notice(p_request uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_mail text;
begin
  select candidate_user_id into v_user from public.account_recovery_requests where id = p_request and owner_notice_sent_at is null;
  if v_user is null then return null; end if;
  if exists (select 1 from public.account_recovery_requests where candidate_user_id = v_user and owner_notice_sent_at > now() - interval '7 days') then
    update public.account_recovery_requests set owner_notice_sent_at = now() where id = p_request; -- marcado, sem novo e-mail
    return null;
  end if;
  update public.account_recovery_requests set owner_notice_sent_at = now() where id = p_request;
  select email into v_mail from auth.users where id = v_user and email not like '%@invalid.local';
  return v_mail;
end $$;

-- ===== Painel do dono =====
create or replace function public.admin_recovery_list(p_status text default 'pendente')
returns table (id uuid, created_at timestamptz, status text, lane text, recommendation text, round smallint, contact_email text, candidate_user_id uuid, notify_at timestamptz, best_score numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query select r.id, r.created_at, r.status, r.lane, r.recommendation, r.round, r.contact_email, r.candidate_user_id, r.notify_at,
      coalesce((r.evaluation->'best'->>'ratio')::numeric, 0)
    from public.account_recovery_requests r
    where p_status is null or p_status = 'todos' or r.status = p_status
    order by r.created_at desc limit 200;
end $$;

create or replace function public.admin_recovery_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select to_jsonb(r) - 'ip' || jsonb_build_object('ip', host(r.ip),
      'candidate_accounts', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'type', p.account_type::text, 'name', p.display_name, 'house_name', h.name,
          'current_email', u.email, 'linked_emails', (select coalesce(jsonb_agg(e.email), '[]'::jsonb) from public.account_linked_emails e where e.user_id = p.id)))
        from jsonb_array_elements(r.candidates) c
        join public.profiles p on p.id = (c->>'user_id')::uuid
        left join public.houses h on h.owner_id = p.id
        left join auth.users u on u.id = p.id), '[]'::jsonb),
      'previous_requests', (select count(*) from public.account_recovery_requests o where o.contact_email_key = r.contact_email_key and o.id <> r.id))
    into v from public.account_recovery_requests r where r.id = p_id;
  return v;
end $$;

-- Decisão exclusiva do dono. Aprovar vincula o NOVO e-mail à conta escolhida (a troca em si só ocorre após 24 h de carência,
-- quando o link de confirmação vai somente para o e-mail novo). O dono nunca vê nem define senha.
create or replace function public.admin_recovery_decide(p_id uuid, p_decision text, p_account uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.account_recovery_requests%rowtype; v_key text;
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_decision not in ('aprovar', 'recusar', 'segunda_rodada') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  select * into r from public.account_recovery_requests where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if r.status <> 'pendente' then raise exception 'Este pedido já foi decidido.' using errcode = '22023'; end if;
  if p_decision = 'segunda_rodada' and r.round >= 2 then raise exception 'Já estamos na segunda rodada.' using errcode = '22023'; end if;
  if p_decision = 'aprovar' then
    if p_account is null or not exists (select 1 from public.profiles where id = p_account and deleted_at is null) then
      raise exception 'Escolha a conta a recuperar.' using errcode = '22023';
    end if;
    v_key := r.contact_email_key;
    if exists (select 1 from auth.users u where public.email_key(u.email) = v_key and u.id <> p_account) then
      raise exception 'Este e-mail já pertence a outra conta.' using errcode = '22023';
    end if;
    if exists (select 1 from auth.users u where u.id = p_account and public.email_key(u.email) = v_key) then
      raise exception 'Este e-mail já é o e-mail atual da conta.' using errcode = '22023';
    end if;
  end if;
  update public.account_recovery_requests set
    status = case p_decision when 'aprovar' then 'aprovado' when 'recusar' then 'recusado' else 'segunda_rodada' end,
    decided_by = auth.uid(), decided_at = now(), decision_account = case when p_decision = 'aprovar' then p_account end,
    decision_note = left(p_note, 500), apply_at = case when p_decision = 'aprovar' then now() + interval '24 hours' end
  where id = p_id;
end $$;

create or replace function public.admin_recovery_scoring_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return (select value from public.platform_settings where key = 'recovery_scoring');
end $$;

create or replace function public.admin_recovery_scoring_set(p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if jsonb_typeof(p_value) <> 'object' or char_length(p_value::text) > 4000 then raise exception 'Configuração inválida.' using errcode = '22023'; end if;
  insert into public.platform_settings (key, value, updated_at, updated_by) values ('recovery_scoring', p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;

-- Leitura da configuração pelo servidor.
create or replace function public.recovery_scoring_get()
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = 'recovery_scoring'
$$;

-- ===== E-mails em fila (servidor) =====
-- Decisões prontas para avisar o NOVO e-mail (só depois do prazo mínimo uniforme de 24 h) e confirmações devidas (fim da carência).
create or replace function public.recovery_due_mails()
returns table (id uuid, kind text, contact_email text, decision text, round smallint, decision_account uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, 'decisao', r.contact_email, r.status, r.round, r.decision_account from public.account_recovery_requests r
    where r.status in ('aprovado', 'recusado', 'segunda_rodada') and r.decision_mail_sent_at is null and r.notify_at <= now()
  union all
  select r.id, 'confirmacao', r.contact_email, r.status, r.round, r.decision_account from public.account_recovery_requests r
    where r.status = 'aprovado' and r.confirm_mail_sent_at is null and r.apply_at <= now() and r.decision_mail_sent_at is not null
$$;

create or replace function public.recovery_mark_mail(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'decisao' then update public.account_recovery_requests set decision_mail_sent_at = now() where id = p_id and decision_mail_sent_at is null;
  elsif p_kind = 'confirmacao' then
    update public.account_recovery_requests set confirm_mail_sent_at = now(), status = 'confirmacao_enviada' where id = p_id and confirm_mail_sent_at is null;
  else raise exception 'tipo inválido' using errcode = '22023'; end if;
end $$;

-- E-mail atual da conta (para o aviso de segurança ao e-mail antigo).
create or replace function public.recovery_account_email(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select email from auth.users where id = p_user and email not like '%@invalid.local'
$$;

-- Quando o e-mail da conta realmente muda, fecha o pedido correspondente.
create or replace function public.recovery_mark_concluded()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.account_recovery_requests set status = 'concluido'
      where decision_account = new.id and status = 'confirmacao_enviada' and contact_email_key = public.email_key(new.email);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_recovery_done on auth.users;
create trigger on_auth_user_email_recovery_done after update of email on auth.users
  for each row execute function public.recovery_mark_concluded();

-- Pedidos sem decisão por 30 dias expiram; confirmações não usadas em 7 dias também.
select cron.schedule('recovery-expire', '17 5 * * *', $c$
  update public.account_recovery_requests set status = 'expirado' where status in ('pendente', 'segunda_rodada') and created_at < now() - interval '30 days';
  update public.account_recovery_requests set status = 'expirado' where status = 'confirmacao_enviada' and confirm_mail_sent_at < now() - interval '7 days';
$c$);

-- Permissões
revoke all on function public.recovery_candidate_facts_raw(text, text, text, text) from public, anon, authenticated;
revoke all on function public.recovery_blocked(text), public.recovery_claim_owner_notice(uuid), public.recovery_scoring_get(),
  public.recovery_due_mails(), public.recovery_mark_mail(uuid, text), public.recovery_account_email(uuid) from public, anon, authenticated;
revoke all on function public.recovery_submit(inet, text, jsonb, jsonb, smallint, uuid, uuid, jsonb, boolean, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.recovery_mark_concluded() from public, anon, authenticated;
grant execute on function public.recovery_blocked(text), public.recovery_claim_owner_notice(uuid), public.recovery_scoring_get(),
  public.recovery_due_mails(), public.recovery_mark_mail(uuid, text), public.recovery_account_email(uuid),
  public.recovery_submit(inet, text, jsonb, jsonb, smallint, uuid, uuid, jsonb, boolean, jsonb, text, text) to service_role;
revoke all on function public.admin_recovery_list(text), public.admin_recovery_get(uuid), public.admin_recovery_decide(uuid, text, uuid, text),
  public.admin_recovery_scoring_get(), public.admin_recovery_scoring_set(jsonb) from public, anon;
grant execute on function public.admin_recovery_list(text), public.admin_recovery_get(uuid), public.admin_recovery_decide(uuid, text, uuid, text),
  public.admin_recovery_scoring_get(), public.admin_recovery_scoring_set(jsonb) to authenticated;

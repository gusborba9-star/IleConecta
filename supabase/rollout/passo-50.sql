-- PASSO 50: 0078_chamados_e_casos — parte 7 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

create or replace function public.purge_deleted_identities()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (update public.deleted_account_identity set display_name = null, email = null, houses = '{}' where retain_until < now() and (display_name is not null or email is not null) returning 1) select count(*) into n from d;
  return n;
end $$;

-- ============ 8) permissões ============
revoke all on function public.open_support_case(text, text, text, text, uuid, uuid, text), public.my_support_cases(), public.my_support_case(uuid),
  public.add_support_case_message(uuid, text), public.submit_support_evidence(uuid, text, text, boolean),
  public.admin_support_queue(text), public.admin_support_dossier(uuid, text), public.admin_support_refresh_facts(uuid, text), public.admin_support_reply(uuid, text, text),
  public.admin_support_request_version(uuid, text), public.admin_support_set_status(uuid, text, text), public.admin_support_decide(uuid, text, text, boolean),
  public.purge_support_cases(), public.purge_deleted_identities(), public.admin_deleted_identity(uuid, text, uuid), public.hold_archive_for_open_case(), public.support_kind_meta(text), public.add_business_days(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.open_support_case(text, text, text, text, uuid, uuid, text), public.my_support_cases(), public.my_support_case(uuid),
  public.add_support_case_message(uuid, text), public.submit_support_evidence(uuid, text, text, boolean),
  public.admin_support_queue(text), public.admin_support_dossier(uuid, text), public.admin_support_refresh_facts(uuid, text), public.admin_support_reply(uuid, text, text),
  public.admin_support_request_version(uuid, text), public.admin_support_set_status(uuid, text, text), public.admin_support_decide(uuid, text, text, boolean), public.admin_deleted_identity(uuid, text, uuid) to authenticated;

do $$
begin
  perform cron.schedule('purge-support-cases', '15 4 * * *', 'select public.purge_support_cases()');
  perform cron.schedule('purge-deleted-identities', '25 4 * * *', 'select public.purge_deleted_identities()');
exception when others then
  raise notice 'pg_cron indisponível: agende purge_support_cases() manualmente';
end $$;

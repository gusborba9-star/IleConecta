-- PASSO 335: 0162_momentos_das_casas — parte 5 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5b) denunciar, ocultar e decidir ============
create or replace function public.report_moment(p_story uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s record; v_n int;
begin
  if v_uid is null then raise exception 'Entre na sua conta para denunciar.' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('conteudo_improprio', 'golpe', 'assedio', 'outro') then raise exception 'Escolha o motivo da denúncia.'; end if;
  select * into s from public.stories where id = p_story and expires_at > now() and purged_at is null and media_path is not null;
  if not found or not public.house_visible_to_me(s.house_id) then raise exception 'Momento indisponível.'; end if;
  if public.is_house_owner(s.house_id) then raise exception 'Você não pode denunciar o próprio momento.'; end if;
  if (select count(*) from public.moment_reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Muitas denúncias hoje. Tente novamente amanhã.';
  end if;
  insert into public.moment_reports (story_id, house_id, reporter_id, reason, media_path, poster_path, media_kind, caption)
    values (s.id, s.house_id, v_uid, p_reason, s.media_path, s.poster_path, s.media_kind, s.caption)
    on conflict (story_id, reporter_id) do nothing;
  select count(distinct r.reporter_id) into v_n from public.moment_reports r where r.story_id = s.id and r.status = 'aberta';
  if v_n >= 3 then update public.stories set hidden_at = coalesce(hidden_at, now()) where id = s.id; end if;
  return 'ok';
end $$;

create or replace function public.admin_moment_reports() returns table (
  story_id uuid, house_id uuid, house_name text, caption text, media_kind text, media_path text, poster_path text,
  first_report timestamptz, n_reports bigint, reasons text[], hidden boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('moderacao') then raise exception 'Acesso restrito à moderação.' using errcode = '42501'; end if;
  return query
  select r.story_id, r.house_id, h.name, max(r.caption), max(r.media_kind), max(r.media_path), max(r.poster_path), min(r.created_at),
         count(*), array_agg(distinct r.reason), coalesce(bool_or(s.hidden_at is not null), false)
    from public.moment_reports r join public.houses h on h.id = r.house_id left join public.stories s on s.id = r.story_id
   where r.status = 'aberta'
   group by r.story_id, r.house_id, h.name
   order by min(r.created_at);
end $$;

create or replace function public.admin_moment_decide(p_story uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('moderacao') then raise exception 'Acesso restrito à moderação.' using errcode = '42501'; end if;
  if p_action not in ('manter', 'remover') then raise exception 'Ação inválida.'; end if;
  if not exists (select 1 from public.moment_reports r where r.story_id = p_story and r.status = 'aberta') then raise exception 'Não há denúncia aberta para este momento.'; end if;
  if p_action = 'manter' then
    update public.stories set hidden_at = null where id = p_story;
  else
    update public.stories set expires_at = least(expires_at, now()), hidden_at = coalesce(hidden_at, now()) where id = p_story;
  end if;
  update public.moment_reports set status = case when p_action = 'remover' then 'procedente' else 'improcedente' end,
         resolved_at = now(), admin_note = nullif(btrim(coalesce(p_note, '')), '')
   where story_id = p_story and status = 'aberta';
  return p_action;
end $$;

revoke all on function public.report_moment(uuid, text), public.admin_moment_reports(), public.admin_moment_decide(uuid, text, text) from public, anon;

grant execute on function public.report_moment(uuid, text), public.admin_moment_reports(), public.admin_moment_decide(uuid, text, text) to authenticated;

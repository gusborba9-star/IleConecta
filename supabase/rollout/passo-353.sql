-- PASSO 353: 0170_momentos_protecao_de_menores — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0170 — Momentos: proteção de crianças e adolescentes e aviso à casa (20/11/2026).
-- Parecer do advogado (ECA e LGPD art. 14): se houver criança ou adolescente sem autorização, a administração retira NA HORA e avisa a casa depois.
-- (1) Novo motivo de denúncia: "Criança ou adolescente sem autorização". Uma denúncia com esse motivo já oculta o Momento (medida preventiva),
--     avisa a casa e aguarda a decisão da moderação; "manter" devolve o Momento ao ar, "remover" o retira de vez.
-- (2) Ao remover (ou devolver ao ar) pela moderação, a casa recebe um aviso amigável no sino.

-- ============ 1) novo motivo ============
alter table public.moment_reports drop constraint if exists moment_reports_reason_check;

alter table public.moment_reports add constraint moment_reports_reason_check check (reason in ('conteudo_improprio', 'golpe', 'assedio', 'menor', 'outro'));

-- ============ 2) avisos para a casa (um texto por situação; vai para os Termos da Casa) ============
create or replace function public.moment_notify_house(p_house uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_text text;
begin
  select h.owner_id into v_owner from public.houses h where h.id = p_house;
  if v_owner is null then return; end if;
  v_text := case p_kind
    when 'oculto_menor' then 'Ocultamos por precaução um Momento da sua casa: pode haver criança ou adolescente sem autorização dos responsáveis. A moderação vai conferir e você será avisado da decisão.'
    when 'removido_menor' then 'Retiramos um Momento da sua casa por proteção a crianças e adolescentes. Só publique imagens de menores com autorização expressa dos pais ou responsáveis (veja os Termos da Casa). Em caso de dúvida, fale com o suporte.'
    when 'removido' then 'Um Momento da sua casa foi retirado pela moderação após uma denúncia. Em caso de dúvida, fale com o suporte.'
    when 'devolvido' then 'A moderação conferiu o Momento da sua casa que estava oculto e ele voltou ao ar.'
  end;
  if v_text is null then raise exception 'Aviso desconhecido.'; end if;
  insert into public.notifications (user_id, text, href) values (v_owner, v_text, case when p_kind in ('oculto_menor', 'removido_menor') then '/sobre/termos-da-casa' else '/suporte' end);
end $$;

revoke all on function public.moment_notify_house(uuid, text) from public, anon, authenticated;

-- ============ 3) denunciar: motivo "menor" oculta na hora ============
create or replace function public.report_moment(p_story uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s record; v_n int; v_was_hidden boolean;
begin
  if v_uid is null then raise exception 'Entre na sua conta para denunciar.' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('conteudo_improprio', 'golpe', 'assedio', 'menor', 'outro') then raise exception 'Escolha o motivo da denúncia.'; end if;
  select * into s from public.stories where id = p_story and expires_at > now() and purged_at is null and media_path is not null;
  if not found or not public.house_visible_to_me(s.house_id) then raise exception 'Momento indisponível.'; end if;
  if public.is_house_owner(s.house_id) then raise exception 'Você não pode denunciar o próprio momento.'; end if;
  if (select count(*) from public.moment_reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Muitas denúncias hoje. Tente novamente amanhã.';
  end if;
  insert into public.moment_reports (story_id, house_id, reporter_id, reason, media_path, poster_path, media_kind, caption)
    values (s.id, s.house_id, v_uid, p_reason, s.media_path, s.poster_path, s.media_kind, s.caption)
    on conflict (story_id, reporter_id) do nothing;
  v_was_hidden := s.hidden_at is not null;
  select count(distinct r.reporter_id) into v_n from public.moment_reports r where r.story_id = s.id and r.status = 'aberta';
  if v_n >= 3 or p_reason = 'menor' then update public.stories set hidden_at = coalesce(hidden_at, now()) where id = s.id; end if;
  if p_reason = 'menor' and not v_was_hidden then perform public.moment_notify_house(s.house_id, 'oculto_menor'); end if;
  return 'ok';
end $$;

revoke all on function public.report_moment(uuid, text) from public, anon;

grant execute on function public.report_moment(uuid, text) to authenticated;

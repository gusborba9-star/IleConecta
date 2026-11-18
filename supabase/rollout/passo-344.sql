-- PASSO 344: 0166_momentos_musica — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- apaga a faixa e devolve o nome do arquivo (o painel remove o arquivo do armazenamento em seguida; se falhar, a limpeza diária remove)
create or replace function public.admin_music_delete(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from public.music_tracks where id = p_id returning path into v_path;
  if v_path is null then raise exception 'Faixa não encontrada.'; end if;
  return v_path;
end $$;

revoke all on function public.admin_music_delete(uuid) from public, anon;

grant execute on function public.admin_music_delete(uuid) to authenticated;

-- ============ 6) publicar com música: só em foto, só faixa ligada e só com o interruptor geral ligado ============
create or replace function public.stories_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text; v_cap int; v_n int; v_ext text; v_re text;
begin
  select h.owner_id, h.plan::text into v_owner, v_plan from public.houses h where h.id = new.house_id;
  if v_owner is null then raise exception 'Casa não encontrada.'; end if;
  v_cap := public.plan_cap_int(v_plan, 'moments_per_day');
  if v_cap <= 0 then raise exception 'Momentos estão disponíveis a partir do plano Essencial.'; end if;
  v_re := '^' || v_owner::text || '/[A-Za-z0-9._-]+\.';
  if new.media_path is null or new.media_path !~* (v_re || '(jpe?g|png|webp|mp4|webm|mov)$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = new.media_path) then
    raise exception 'O arquivo do momento precisa ser enviado pela própria plataforma.';
  end if;
  v_ext := lower(substring(new.media_path from '\.([A-Za-z0-9]+)$'));
  new.media_kind := case when v_ext in ('mp4', 'webm', 'mov') then 'video' else 'image' end;
  if new.media_kind = 'video' then
    if not public.plan_cap_bool(v_plan, 'moment_video') then raise exception 'Momentos em vídeo estão disponíveis no plano Premium.'; end if;
    if new.poster_path is null or new.poster_path !~* (v_re || '(jpe?g|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = new.poster_path) then
      raise exception 'O vídeo do momento precisa de uma imagem de capa enviada pela plataforma.';
    end if;
    if new.duration_s is null or new.duration_s not between 1 and 31 then raise exception 'O vídeo pode ter até 30 segundos.'; end if;
  else
    new.poster_path := null;
    new.duration_s := null;
  end if;
  if new.link_kind = 'service' then
    if not exists (select 1 from public.services s where s.id = new.link_id and s.house_id = new.house_id and s.active) then raise exception 'O serviço escolhido não está disponível.'; end if;
  elsif new.link_kind = 'event' then
    if not exists (select 1 from public.events e where e.id = new.link_id and e.house_id = new.house_id and e.status = 'publicado') then raise exception 'O ritual escolhido não está disponível.'; end if;
  end if;
  new.caption := nullif(btrim(coalesce(new.caption, '')), '');
  perform pg_advisory_xact_lock(hashtextextended('moments:' || new.house_id::text, 0));
  select count(*) into v_n from public.moment_publish_log l where l.house_id = new.house_id and l.created_at > now() - interval '24 hours';
  if v_n >= v_cap then raise exception 'Você chegou ao limite de % momento(s) por dia do seu plano.', v_cap; end if;
  insert into public.moment_publish_log (house_id) values (new.house_id);
  if new.music_id is not null then
    if new.media_kind <> 'image' then new.music_id := null;
    elsif not coalesce((select ms.enabled from public.music_settings ms), false)
       or not exists (select 1 from public.music_tracks t where t.id = new.music_id and t.active) then
      raise exception 'A música escolhida não está disponível.';
    end if;
  end if;
  new.image_url := null;
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.hidden_at := null;
  new.purged_at := null;
  return new;
end $$;

revoke execute on function public.stories_guard() from public, anon, authenticated;

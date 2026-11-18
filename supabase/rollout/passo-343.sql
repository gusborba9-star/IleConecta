-- PASSO 343: 0166_momentos_musica — parte 2 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) catálogo para quem publica (só faixas ligadas, só com o interruptor geral ligado) ============
create or replace function public.music_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and (select enabled from public.music_settings)
    then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'author', t.author, 'path', t.path) order by lower(t.title)) from public.music_tracks t where t.active), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

revoke all on function public.music_catalog() from public, anon;

grant execute on function public.music_catalog() to authenticated;

-- ============ 5) painel do proprietário ============
create or replace function public.admin_music_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', (select enabled from public.music_settings),
    'max_total_bytes', (select max_total_bytes from public.music_settings),
    'total_bytes', (select coalesce(sum(size_bytes), 0) from public.music_tracks),
    'max_count', 300,
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'author', t.author, 'source_url', t.source_url,
        'license_note', t.license_note, 'license_date', t.license_date, 'path', t.path, 'size_bytes', t.size_bytes, 'active', t.active,
        'created_at', t.created_at, 'uses', (select count(*) from public.stories s where s.music_id = t.id)) order by t.created_at desc) from public.music_tracks t), '[]'::jsonb));
end $$;

revoke all on function public.admin_music_list() from public, anon;

grant execute on function public.admin_music_list() to authenticated;

create or replace function public.admin_music_add(p_path text, p_title text, p_author text, p_source text, p_license text, p_license_date date, p_size integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total bigint; v_max bigint;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('music:add', 0));
  if (select count(*) from public.music_tracks) >= 300 then raise exception 'A biblioteca chegou ao limite de 300 faixas.'; end if;
  if p_path is null or p_path !~ '^[a-z0-9]{8,32}\.(mp3|m4a|ogg)$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'music' and o.name = p_path) then
    raise exception 'O arquivo da música precisa ser enviado pela própria plataforma (MP3, M4A ou OGG, até 8 MB).';
  end if;
  select coalesce(sum(size_bytes), 0), (select max_total_bytes from public.music_settings) into v_total, v_max from public.music_tracks;
  if coalesce(p_size, 0) < 1 or v_total + p_size > v_max then
    raise exception 'O espaço reservado para músicas (% MB) acabou. Apague faixas que não usa mais.', v_max / 1048576;
  end if;
  insert into public.music_tracks (title, author, source_url, license_note, license_date, path, size_bytes, created_by)
  values (btrim(p_title), btrim(p_author), nullif(btrim(coalesce(p_source, '')), ''), nullif(btrim(coalesce(p_license, '')), ''), p_license_date, p_path, p_size, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.admin_music_add(text, text, text, text, text, date, integer) from public, anon;

grant execute on function public.admin_music_add(text, text, text, text, text, date, integer) to authenticated;

create or replace function public.admin_music_update(p_id uuid, p_title text, p_author text, p_source text, p_license text, p_license_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.music_tracks set title = btrim(p_title), author = btrim(p_author), source_url = nullif(btrim(coalesce(p_source, '')), ''),
    license_note = nullif(btrim(coalesce(p_license, '')), ''), license_date = p_license_date where id = p_id;
  if not found then raise exception 'Faixa não encontrada.'; end if;
end $$;

revoke all on function public.admin_music_update(uuid, text, text, text, text, date) from public, anon;

grant execute on function public.admin_music_update(uuid, text, text, text, text, date) to authenticated;

create or replace function public.admin_music_set_active(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Informe ligar ou desligar.'; end if;
  update public.music_tracks set active = p_on where id = p_id;
  if not found then raise exception 'Faixa não encontrada.'; end if;
end $$;

revoke all on function public.admin_music_set_active(uuid, boolean) from public, anon;

grant execute on function public.admin_music_set_active(uuid, boolean) to authenticated;

create or replace function public.admin_music_set_enabled(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare old_v boolean;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Informe ligar ou desligar.'; end if;
  select enabled into old_v from public.music_settings;
  update public.music_settings set enabled = p_on, updated_at = now(), updated_by = auth.uid() where id;
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'music_enabled', to_jsonb(old_v), to_jsonb(p_on));
end $$;

revoke all on function public.admin_music_set_enabled(boolean) from public, anon;

grant execute on function public.admin_music_set_enabled(boolean) to authenticated;

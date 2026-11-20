-- PASSO 352: 0169_registro_de_faixas_retiradas — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) consulta do registro (só o dono) ============
create or replace function public.admin_music_log() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'removed_at', l.removed_at, 'keep_until', l.keep_until, 'by', p.display_name,
      'reason', l.removal_reason, 'title', l.title, 'author', l.author, 'source_url', l.source_url, 'license_kind', l.license_kind,
      'license_url', l.license_url, 'license_note', l.license_note, 'license_date', l.license_date, 'license_proof', l.license_proof) order by l.removed_at desc, l.id desc)
    from (select * from public.music_license_log order by removed_at desc, id desc limit 200) l left join public.profiles p on p.id = l.removed_by), '[]'::jsonb);
end $$;

revoke all on function public.admin_music_log() from public, anon;

grant execute on function public.admin_music_log() to authenticated;

-- ============ 5) a lista do painel devolve a referência do print ============
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
        'created_at', t.created_at, 'style', t.style, 'occasions', t.occasions, 'vocal', t.vocal, 'license_kind', t.license_kind,
        'license_url', t.license_url, 'license_proof', t.license_proof, 'uses', (select count(*) from public.stories s where s.music_id = t.id)) order by t.created_at desc) from public.music_tracks t), '[]'::jsonb));
end $$;

revoke all on function public.admin_music_list() from public, anon;

grant execute on function public.admin_music_list() to authenticated;

-- ============ 6) limpeza diária: depois de 5 anos o registro é apagado ============
do $$
begin
  perform cron.schedule('purge-music-license-log', '55 3 * * *', 'delete from public.music_license_log where keep_until < now()');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

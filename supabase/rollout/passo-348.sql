-- PASSO 348: 0167_musica_categorias_e_creditos — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) créditos de áudio (página para quem está logado; só faixas ligadas e só com a música ligada) ============
create or replace function public.music_credits() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and (select enabled from public.music_settings)
    then coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'author', t.author, 'source_url', t.source_url,
        'license_kind', t.license_kind, 'license_url', t.license_url, 'license_note', t.license_note) order by lower(t.title)) from public.music_tracks t where t.active), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

revoke all on function public.music_credits() from public, anon;

grant execute on function public.music_credits() to authenticated;

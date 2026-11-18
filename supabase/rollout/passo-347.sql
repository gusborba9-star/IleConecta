-- PASSO 347: 0167_musica_categorias_e_creditos — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0167 — Momentos 2D: estilo, ocasião, voz, licença e créditos das músicas (18/11/2026).
-- Cada faixa ganha: estilo (pop, mpb, sertanejo…), ocasiões (festa, aniversário, romântica…), se tem voz, tipo de licença (CC0, CC BY 4.0…)
-- e o link da licença. As listas de estilos/ocasiões moram no código (só o formato é conferido aqui), para crescer sem mexer no banco.
-- Página "Créditos de Áudio": título, autor, fonte e licença de cada faixa ligada (exigência da CC BY 4.0).

-- ============ 1) novos campos da faixa ============
alter table public.music_tracks add column if not exists style text;

alter table public.music_tracks add column if not exists occasions text[] not null default '{}';

alter table public.music_tracks add column if not exists vocal boolean not null default false;

alter table public.music_tracks add column if not exists license_kind text;

alter table public.music_tracks add column if not exists license_url text;

alter table public.music_tracks drop constraint if exists music_tracks_meta_chk;

alter table public.music_tracks add constraint music_tracks_meta_chk check (
  (style is null or style ~ '^[a-z_]{2,20}$')
  and cardinality(occasions) <= 5
  and (license_kind is null or license_kind in ('cc0', 'cc_by', 'dominio_publico', 'outra'))
  and (license_url is null or (license_url ~ '^https://[^\s<>"]+$' and char_length(license_url) <= 300)));

-- ============ 2) atualiza os campos novos de uma faixa (validação das ocasiões e do estilo) ============
create or replace function public.admin_music_meta(p_id uuid, p_style text, p_occasions text[], p_vocal boolean, p_license_kind text, p_license_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_occ text[];
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  v_occ := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_occasions, '{}')) x), '{}');
  if cardinality(v_occ) > 5 then raise exception 'Escolha no máximo 5 ocasiões.'; end if;
  if exists (select 1 from unnest(v_occ) x where x !~ '^[a-z_]{2,20}$') then raise exception 'Ocasião inválida.'; end if;
  if nullif(btrim(coalesce(p_style, '')), '') is not null and btrim(p_style) !~ '^[a-z_]{2,20}$' then raise exception 'Estilo inválido.'; end if;
  if p_license_kind is not null and p_license_kind not in ('cc0', 'cc_by', 'dominio_publico', 'outra') then raise exception 'Tipo de licença inválido.'; end if;
  if nullif(btrim(coalesce(p_license_url, '')), '') is not null and (btrim(p_license_url) !~ '^https://[^\s<>"]+$' or char_length(btrim(p_license_url)) > 300) then
    raise exception 'O link da licença precisa começar com https://';
  end if;
  update public.music_tracks set style = nullif(btrim(coalesce(p_style, '')), ''), occasions = v_occ, vocal = coalesce(p_vocal, false),
    license_kind = p_license_kind, license_url = nullif(btrim(coalesce(p_license_url, '')), '') where id = p_id;
  if not found then raise exception 'Faixa não encontrada.'; end if;
end $$;

revoke all on function public.admin_music_meta(uuid, text, text[], boolean, text, text) from public, anon;

grant execute on function public.admin_music_meta(uuid, text, text[], boolean, text, text) to authenticated;

-- ============ 3) catálogo e painel devolvem os campos novos ============
create or replace function public.music_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and (select enabled from public.music_settings)
    then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'author', t.author, 'path', t.path,
        'style', t.style, 'occasions', t.occasions, 'vocal', t.vocal) order by lower(t.title)) from public.music_tracks t where t.active), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

revoke all on function public.music_catalog() from public, anon;

grant execute on function public.music_catalog() to authenticated;

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
        'license_url', t.license_url, 'uses', (select count(*) from public.stories s where s.music_id = t.id)) order by t.created_at desc) from public.music_tracks t), '[]'::jsonb));
end $$;

revoke all on function public.admin_music_list() from public, anon;

grant execute on function public.admin_music_list() to authenticated;

-- PASSO 351: 0169_registro_de_faixas_retiradas — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0169 — Registro de 5 anos das faixas retiradas da biblioteca de músicas (20/11/2026).
-- Parecer do advogado: guardar, por 5 anos, a prova da licença de cada faixa apagada (título, autor, fonte, licença, datas),
-- mais quem retirou, o motivo e onde está o print da licença. Tabela fechada (só o dono lê, por função); não guarda dado de usuário.
-- Apagar a faixa passa a gravar o registro na mesma transação. A limpeza diária apaga o que passou de 5 anos.

-- ============ 1) onde está o print da licença (campo livre da faixa) ============
alter table public.music_tracks add column if not exists license_proof text;

alter table public.music_tracks drop constraint if exists music_tracks_proof_chk;

alter table public.music_tracks add constraint music_tracks_proof_chk check (license_proof is null or (char_length(license_proof) <= 200 and license_proof !~ '[<>[:cntrl:]]'));

create or replace function public.admin_music_proof(p_id uuid, p_proof text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := nullif(regexp_replace(btrim(coalesce(p_proof, '')), '\s+', ' ', 'g'), '');
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if v is not null and (char_length(v) > 200 or v ~ '[<>[:cntrl:]]') then raise exception 'A referência do print pode ter até 200 caracteres, sem < ou >.'; end if;
  update public.music_tracks set license_proof = v where id = p_id;
  if not found then raise exception 'Faixa não encontrada.'; end if;
end $$;

revoke all on function public.admin_music_proof(uuid, text) from public, anon;

grant execute on function public.admin_music_proof(uuid, text) to authenticated;

-- ============ 2) o registro (fechado) ============
create table if not exists public.music_license_log (
  id bigint generated always as identity primary key,
  removed_at timestamptz not null default now(),
  keep_until timestamptz not null default (now() + interval '5 years'),
  removed_by uuid references public.profiles(id) on delete set null,
  removal_reason text not null check (char_length(removal_reason) between 3 and 300),
  title text not null, author text not null, source_url text, license_kind text, license_url text, license_note text,
  license_date date, license_proof text, style text, added_at timestamptz
);

create index if not exists music_license_log_keep on public.music_license_log (keep_until);

alter table public.music_license_log enable row level security;

revoke all on public.music_license_log from public, anon, authenticated;

-- ============ 3) apagar a faixa grava o registro (motivo opcional: sem ele, "Removida pela administração") ============
drop function if exists public.admin_music_delete(uuid);

create or replace function public.admin_music_delete(p_id uuid, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare t public.music_tracks; v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if v_reason is not null and (char_length(v_reason) < 3 or char_length(v_reason) > 300) then raise exception 'O motivo precisa ter de 3 a 300 caracteres.'; end if;
  delete from public.music_tracks where id = p_id returning * into t;
  if t.id is null then raise exception 'Faixa não encontrada.'; end if;
  insert into public.music_license_log (removed_by, removal_reason, title, author, source_url, license_kind, license_url, license_note, license_date, license_proof, style, added_at)
  values (auth.uid(), coalesce(v_reason, 'Removida pela administração'), t.title, t.author, t.source_url, t.license_kind, t.license_url, t.license_note, t.license_date, t.license_proof, t.style, t.created_at);
  return t.path;
end $$;

revoke all on function public.admin_music_delete(uuid, text) from public, anon;

grant execute on function public.admin_music_delete(uuid, text) to authenticated;

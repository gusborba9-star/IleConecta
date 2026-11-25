-- 0222 — O servidor também exige a versão mínima do aceite (decisão do proprietário, 24/11/2026).
-- Antes: só a tela travava; as compras conferiam apenas se existia aceite do documento, em qualquer versão.
-- Agora: has_client_terms (compra do cliente) e house_accepted_terms (casa vendendo) exigem um aceite na versão mínima vigente
-- do documento (tabela legal_min_version, a mesma regra de DOC_MIN_VERSION no app, conferida por teste).
-- Esta migração NÃO muda o comportamento hoje: o mínimo inicial é a primeira versão. O mínimo sobe na 0223, aplicada junto com o app novo.

-- Versão mínima exigida de cada documento. Só o servidor lê (RLS ligada, sem política e sem permissão direta).
create table if not exists public.legal_min_version (
  doc_key text primary key check (doc_key in ('termos_cliente', 'termos_casa')),
  min_version text not null check (char_length(min_version) between 1 and 60),
  updated_at timestamptz not null default now()
);
alter table public.legal_min_version enable row level security;
revoke all on table public.legal_min_version from public, anon, authenticated;

-- Posição de uma versão ("AAAA-MM-nome-N"): permite comparar sem lista. Formato diferente = desconhecida (null) = conta como antiga.
create or replace function public.legal_version_rank(p_version text)
returns bigint language sql immutable set search_path = public as $$
  select case when m is null then null
    else m[1]::bigint * 10000000000 + m[2]::bigint * 100000 + m[3]::bigint end
  from (select regexp_match(coalesce(p_version, ''), '^(\d{4})-(\d{2})-[a-z]+-(\d{1,5})$') m) x;
$$;

-- O aceite desta pessoa para o documento está na versão mínima vigente (ou acima)?
create or replace function public.legal_accepted_current(p_user uuid, p_doc text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_min text; v_rank bigint;
begin
  select m.min_version into v_min from public.legal_min_version m where m.doc_key = p_doc;
  if v_min is null then
    return exists (select 1 from public.legal_consents c where c.user_id = p_user and c.doc_key = p_doc);
  end if;
  v_rank := public.legal_version_rank(v_min);
  if v_rank is null then return false; end if;
  return exists (select 1 from public.legal_consents c
                  where c.user_id = p_user and c.doc_key = p_doc and public.legal_version_rank(c.doc_version) >= v_rank);
end $$;
revoke all on function public.legal_version_rank(text) from public, anon, authenticated;
revoke all on function public.legal_accepted_current(uuid, text) from public, anon, authenticated;

create or replace function public.has_client_terms(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.legal_accepted_current(p_user, 'termos_cliente');
$$;
revoke all on function public.has_client_terms(uuid) from public, anon, authenticated;

create or replace function public.house_accepted_terms(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.legal_accepted_current(p_owner, 'termos_casa');
$$;
revoke all on function public.house_accepted_terms(uuid) from public, anon;
grant execute on function public.house_accepted_terms(uuid) to authenticated;

-- Mínimo inicial: a primeira versão (nada muda até a 0223).
insert into public.legal_min_version (doc_key, min_version)
values ('termos_cliente', '2026-10-rascunho-1'), ('termos_casa', '2026-10-rascunho-1')
on conflict (doc_key) do nothing;

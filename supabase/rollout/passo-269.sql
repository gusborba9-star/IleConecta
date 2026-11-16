-- PASSO 269: 0126_cpf_cnpj_da_casa — parte 1 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0126 — CPF/CNPJ da casa na contratação de plano pago (decisões do proprietário, 15/11/2026).
-- Pedido ao contratar plano pago (assinar, reativar, subir de plano, comprar vaga extra); a casa Grátis não precisa informar.
-- Guardado protegido: criptografado no banco com chave do cofre (Vault), sem acesso direto de nenhum usuário; a casa vê só o final mascarado.
-- A administração consulta o número completo só por função que exige motivo e registra a consulta. Uso: cobrança e obrigações fiscais.
-- Casas que já assinam não são bloqueadas: o pedido aparece em Planos e o dado passa a ser exigido na próxima contratação.

-- ============ 1) Validação dos dígitos (CPF e CNPJ) e máscaras
create or replace function public.tax_id_kind(p text) returns text
language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'); a int[]; s int; r int; i int; w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
if d ~ '^(.)\1*$' then return null; end if;
if length(d) = 11 then
  select array_agg(substr(d, g, 1)::int order by g) into a from generate_series(1, 11) g;
  s := 0; for i in 1..9 loop s := s + a[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> a[10] then return null; end if;
  s := 0; for i in 1..10 loop s := s + a[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> a[11] then return null; end if;
  return 'cpf';
elsif length(d) = 14 then
  select array_agg(substr(d, g, 1)::int order by g) into a from generate_series(1, 14) g;
  s := 0; for i in 1..12 loop s := s + a[i] * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> a[13] then return null; end if;
  s := 0; for i in 1..13 loop s := s + a[i] * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> a[14] then return null; end if;
  return 'cnpj';
end if;
return null;
end $$;

create or replace function public.tax_id_format(p text) returns text
language sql immutable set search_path = public as $$
select case length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'))
  when 11 then regexp_replace(regexp_replace(p, '[^0-9]', '', 'g'), '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')
  when 14 then regexp_replace(regexp_replace(p, '[^0-9]', '', 'g'), '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5')
  else null end;
$$;

revoke all on function public.tax_id_kind(text), public.tax_id_format(text) from public, anon, authenticated;

-- ============ 2) Chave de criptografia no cofre (criada uma vez) e tabelas fechadas
do $$
begin
if not exists (select 1 from vault.decrypted_secrets where name = 'tax_id_key') then
  perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'tax_id_key', 'Chave do CPF/CNPJ das casas (não apagar: sem ela os documentos não abrem)');
end if;
end $$;

create table if not exists public.house_tax_ids (
house_id uuid primary key references public.houses(id) on delete cascade,
kind text not null check (kind in ('cpf', 'cnpj')),
doc_enc bytea not null,
masked text not null check (char_length(masked) between 10 and 30),
set_by uuid,
set_at timestamptz not null default now()
);

create table if not exists public.tax_id_access_log (
id bigint generated always as identity primary key,
admin_id uuid not null,
house_id uuid not null,
action text not null check (action in ('ver', 'corrigir')),
reason text not null check (char_length(reason) between 10 and 300),
at timestamptz not null default now()
);

alter table public.house_tax_ids enable row level security;

alter table public.tax_id_access_log enable row level security;

revoke all on public.house_tax_ids, public.tax_id_access_log from public, anon, authenticated;

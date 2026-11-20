-- 0168 — Identificação do operador da plataforma (20/11/2026).
-- Parecer do advogado (Decreto 7.962/13 e LGPD): os Termos e a Política dizem quem opera o Ilê Conecta, com um canal de atendimento.
-- Hoje é pessoa física (CPF mascarado); quando abrir CNPJ, o dono troca os dados no painel, sem mexer em código.
-- Só a identificação aparece em público (nome, documento, endereço e e-mail, se houver). O CPF completo é recusado pelo banco.
-- Cada mudança fica no histórico (quem, quando, o quê) e avisa todas as contas, sem travar ninguém.

-- ============ 1) dados atuais (uma linha só) e histórico ============
create table if not exists public.operator_identity (
  id smallint primary key default 1 check (id = 1),
  name text not null check (char_length(name) between 3 and 120 and name !~ '[<>[:cntrl:]]'),
  document text not null check (document ~ '^\*{3}\.\d{3}\.\d{3}-\*{2}$' or document ~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$'),
  address text check (address is null or (char_length(address) between 5 and 200 and address !~ '[<>[:cntrl:]]')),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 120 and contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create table if not exists public.operator_identity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by_user uuid references public.profiles(id) on delete set null,
  name text not null, document text not null, address text, contact_email text
);
alter table public.operator_identity enable row level security;
alter table public.operator_identity_log enable row level security;
revoke all on public.operator_identity, public.operator_identity_log from public, anon, authenticated;

-- ============ 2) dado inicial (CPF mascarado, como o advogado orientou) ============
insert into public.operator_identity (id, name, document) values (1, 'Gustavo dos Santos Borba', '***.116.210-**') on conflict (id) do nothing;

-- ============ 3) leitura pública: só a identificação ============
create or replace function public.operator_identity_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', o.name, 'document', o.document, 'address', o.address, 'email', o.contact_email) from public.operator_identity o where o.id = 1;
$$;
revoke all on function public.operator_identity_public() from public;
grant execute on function public.operator_identity_public() to anon, authenticated;

-- ============ 4) o dono troca os dados (documento mascarado, histórico e aviso opcional) ============
create or replace function public.admin_operator_set(p_name text, p_document text, p_address text, p_email text, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_doc text := btrim(coalesce(p_document, ''));
  v_addr text := nullif(regexp_replace(btrim(coalesce(p_address, '')), '\s+', ' ', 'g'), '');
  v_mail text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_cur public.operator_identity;
  v_n integer := 0;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 or v_name ~ '[<>[:cntrl:]]' then raise exception 'Informe o nome completo (de 3 a 120 letras).'; end if;
  if v_doc !~ '^\*{3}\.\d{3}\.\d{3}-\*{2}$' and v_doc !~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$' then
    raise exception 'Documento inválido: use o CPF mascarado (***.123.456-**) ou o CNPJ completo (00.000.000/0000-00). O CPF completo não pode ser publicado.';
  end if;
  if v_addr is not null and (char_length(v_addr) < 5 or char_length(v_addr) > 200 or v_addr ~ '[<>[:cntrl:]]') then raise exception 'Endereço inválido (de 5 a 200 caracteres).'; end if;
  if v_mail is not null and (char_length(v_mail) > 120 or v_mail !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then raise exception 'E-mail de atendimento inválido.'; end if;
  select * into v_cur from public.operator_identity where id = 1 for update;
  if found and v_cur.name = v_name and v_cur.document = v_doc and v_cur.address is not distinct from v_addr and v_cur.contact_email is not distinct from v_mail then
    raise exception 'Nada mudou.';
  end if;
  insert into public.operator_identity (id, name, document, address, contact_email, updated_at, updated_by)
    values (1, v_name, v_doc, v_addr, v_mail, now(), auth.uid())
    on conflict (id) do update set name = excluded.name, document = excluded.document, address = excluded.address,
      contact_email = excluded.contact_email, updated_at = now(), updated_by = auth.uid();
  insert into public.operator_identity_log (by_user, name, document, address, contact_email) values (auth.uid(), v_name, v_doc, v_addr, v_mail);
  if coalesce(p_notify, true) then
    v_n := public.platform_announce('Em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ' atualizamos a identificação de quem opera a plataforma, nos Termos e na Política de Privacidade.', '/termos');
  end if;
  return jsonb_build_object('ok', true, 'notified', v_n);
end $$;
revoke all on function public.admin_operator_set(text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_operator_set(text, text, text, text, boolean) to authenticated;

-- ============ 5) histórico (só o dono) ============
create or replace function public.admin_operator_log() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'by', p.display_name, 'name', l.name, 'document', l.document, 'address', l.address, 'email', l.contact_email) order by l.at desc, l.id desc)
    from (select * from public.operator_identity_log order by at desc, id desc limit 20) l left join public.profiles p on p.id = l.by_user), '[]'::jsonb);
end $$;
revoke all on function public.admin_operator_log() from public, anon;
grant execute on function public.admin_operator_log() to authenticated;

-- 0127 — Endurecimento das etapas 0123–0126 (bateria adversarial de 15/11/2026).
-- 1) CPF/CNPJ: aceita só dígitos, letras e . - / espaço (nada de "lixo ao redor do número"); passa a aceitar o CNPJ alfanumérico
--    (novo formato da Receita Federal, emitido desde julho/2026: 12 posições de 0-9/A-Z + 2 dígitos verificadores; valor = código ASCII − 48).
-- 2) Redução de vagas na renovação: rotinas simultâneas não aplicam (nem avisam) duas vezes — trava por casa com "skip locked".
-- 3) Permissões: house_seat_allowance não é mais executável por visitante sem login; o cliente do app (anon/authenticated) deixa de ter
--    permissão de ESCRITA nas tabelas house_extra_seats e platform_settings (já eram bloqueadas por RLS; agora também por privilégio).

-- ============ 1) CPF/CNPJ: normalização estrita + CNPJ alfanumérico
create or replace function public.tax_id_norm(p text) returns text
language sql immutable set search_path = public as $$
select case
  when p is null or char_length(p) > 40 then null
  when btrim(p) !~ '^[0-9A-Za-z./ -]+$' then null
  else nullif(upper(regexp_replace(btrim(p), '[./ -]', '', 'g')), '')
end;
$$;

create or replace function public.tax_id_kind(p text) returns text
language plpgsql immutable set search_path = public as $$
declare d text := public.tax_id_norm(p); a int[]; s int; r int; i int; w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
if d is null then return null; end if;
if d ~ '^(.)\1*$' then return null; end if;
if length(d) = 11 and d ~ '^[0-9]{11}$' then
  select array_agg(substr(d, g, 1)::int order by g) into a from generate_series(1, 11) g;
  s := 0; for i in 1..9 loop s := s + a[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> a[10] then return null; end if;
  s := 0; for i in 1..10 loop s := s + a[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> a[11] then return null; end if;
  return 'cpf';
elsif length(d) = 14 and d ~ '^[0-9A-Z]{12}[0-9]{2}$' then
  select array_agg(ascii(substr(d, g, 1)) - 48 order by g) into a from generate_series(1, 14) g;
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
select case
  when public.tax_id_norm(p) ~ '^[0-9]{11}$' then regexp_replace(public.tax_id_norm(p), '^(.{3})(.{3})(.{3})(.{2})$', '\1.\2.\3-\4')
  when public.tax_id_norm(p) ~ '^[0-9A-Z]{12}[0-9]{2}$' then regexp_replace(public.tax_id_norm(p), '^(.{2})(.{3})(.{3})(.{4})(.{2})$', '\1.\2.\3/\4-\5')
  else null end;
$$;

create or replace function public.tax_id_store(p_house uuid, p_doc text, p_by uuid, p_replace boolean) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d text := public.tax_id_norm(p_doc); k text := public.tax_id_kind(p_doc); key text := public.tax_id_key(); m text;
begin
if k is null or d is null then raise exception 'CPF ou CNPJ inválido. Confira os números.'; end if;
if key is null then raise exception 'Não foi possível guardar o documento agora. Tente de novo.'; end if;
m := case k when 'cpf' then '***.***.***-' || right(d, 2) else '**.***.***/****-' || right(d, 2) end;
if p_replace then
  insert into public.house_tax_ids (house_id, kind, doc_enc, masked, set_by) values (p_house, k, pgp_sym_encrypt(d, key), m, p_by)
  on conflict (house_id) do update set kind = excluded.kind, doc_enc = excluded.doc_enc, masked = excluded.masked, set_by = excluded.set_by, set_at = now();
else
  insert into public.house_tax_ids (house_id, kind, doc_enc, masked, set_by) values (p_house, k, pgp_sym_encrypt(d, key), m, p_by);
end if;
return k;
end $$;

revoke all on function public.tax_id_norm(text), public.tax_id_kind(text), public.tax_id_format(text), public.tax_id_store(uuid, text, uuid, boolean) from public, anon, authenticated;

-- ============ 2) Redução de vagas: uma aplicação só, mesmo com rotinas simultâneas
create or replace function public.platform_seat_release_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0; v_owner uuid;
begin
for r in select house_id, seats, release_to from public.house_extra_seats where release_on is not null and release_on <= d order by release_on for update skip locked loop
begin
update public.house_extra_seats set seats = least(seats, release_to), release_to = null, release_on = null where house_id = r.house_id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vagas_reduzidas', 'processado', r.house_id::text || ':' || r.seats || '>' || r.release_to);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'As vagas extras de equipe foram reduzidas na renovação, como você pediu.', '/equipe');
end if;
n := n + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_reducao_vagas', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

revoke all on function public.platform_seat_release_apply_due(timestamptz) from public, anon, authenticated;
grant execute on function public.platform_seat_release_apply_due(timestamptz) to service_role;

-- ============ 3) Permissões
revoke all on function public.house_seat_allowance(uuid) from public, anon;
grant execute on function public.house_seat_allowance(uuid) to authenticated, service_role;
revoke insert, update, delete, truncate on public.house_extra_seats from anon, authenticated;
revoke insert, update, delete, truncate on public.platform_settings from anon, authenticated;

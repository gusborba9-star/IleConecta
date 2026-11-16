-- PASSO 270: 0126_cpf_cnpj_da_casa — parte 2 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) Funções internas (chave, exigência na contratação)
create or replace function public.tax_id_key() returns text
language sql stable security definer set search_path = public, extensions as $$
select decrypted_secret from vault.decrypted_secrets where name = 'tax_id_key' limit 1;
$$;

create or replace function public.platform_require_tax_id(p_house uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
if not exists (select 1 from public.house_tax_ids where house_id = p_house) then
raise exception 'Informe o CPF ou CNPJ da casa em Planos antes de contratar.';
end if;
end $$;

revoke all on function public.tax_id_key(), public.platform_require_tax_id(uuid) from public, anon, authenticated;

-- ============ 4) A casa informa (uma vez) e vê só o final
create or replace function public.tax_id_store(p_house uuid, p_doc text, p_by uuid, p_replace boolean) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d text := regexp_replace(coalesce(p_doc, ''), '[^0-9]', '', 'g'); k text := public.tax_id_kind(p_doc); key text := public.tax_id_key(); m text;
begin
if k is null then raise exception 'CPF ou CNPJ inválido. Confira os números.'; end if;
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

create or replace function public.my_tax_id_set(p_doc text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; k text;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa informa o CPF ou CNPJ.'; end if;
if exists (select 1 from public.house_tax_ids where house_id = h) then raise exception 'O documento já foi informado. Para corrigir, fale com o Suporte.'; end if;
begin
k := public.tax_id_store(h, p_doc, me, false);
exception when unique_violation then raise exception 'O documento já foi informado. Para corrigir, fale com o Suporte.';
end;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'documento_informado', 'processado', h::text || ':' || k);
return jsonb_build_object('kind', k);
end $$;

create or replace function public.my_tax_id_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; t public.house_tax_ids;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
select * into t from public.house_tax_ids where house_id = h;
return jsonb_build_object('has_house', true, 'set', found, 'kind', t.kind, 'masked', t.masked,
  'subscribed', exists (select 1 from public.house_billing_plan where house_id = h and active));
end $$;

revoke all on function public.tax_id_store(uuid, text, uuid, boolean), public.my_tax_id_set(text), public.my_tax_id_status() from public, anon, authenticated;

grant execute on function public.my_tax_id_set(text), public.my_tax_id_status() to authenticated;

-- Autorização de cobrança automática no cartão (exigência jurídica: consentimento específico, caixa desmarcada, com plano, valor e periodicidade).
-- 1) novo tipo de aceite; 2) registro imutável do que a casa viu e autorizou; 3) o servidor só abre o cadastro do cartão e só liga a cobrança
-- automática se houver uma autorização recente (60 minutos) da própria casa. Rode no SQL Editor. É seguro repetir.

-- ============ 1) novo tipo de aceite ============
alter table public.legal_consents drop constraint if exists legal_consents_doc_key_check;

alter table public.legal_consents add constraint legal_consents_doc_key_check
check (doc_key = any (array['termos_cliente', 'checkout_ritual', 'checkout_servico', 'dados_sensiveis', 'dados_sensiveis_retirada', 'termos_casa', 'cobranca_automatica']));

-- ============ 2) o que a casa viu e autorizou (só de acréscimo) ============
create table if not exists public.house_auto_authorizations (
id uuid primary key default gen_random_uuid(),
house_id uuid not null,
user_id uuid not null,
consent_id uuid not null references public.legal_consents(id) on delete restrict,
plan_key text check (plan_key is null or char_length(plan_key) between 1 and 40),
amount_cents bigint check (amount_cents is null or amount_cents >= 0),
period text not null check (period in ('mensal', 'trimestral', 'anual')),
text_shown text not null check (char_length(text_shown) between 20 and 1500),
created_at timestamptz not null default now()
);

create index if not exists house_auto_authorizations_house on public.house_auto_authorizations (house_id, created_at desc);

alter table public.house_auto_authorizations enable row level security;

drop policy if exists haa_read on public.house_auto_authorizations;

create policy haa_read on public.house_auto_authorizations for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

-- ============ 3) ninguém altera nem apaga ============
create or replace function public.house_auto_authorizations_guard() returns trigger
language plpgsql set search_path = public as $$
begin
raise exception 'A autorização de cobrança automática não pode ser alterada nem apagada.';
end $$;

drop trigger if exists trg_house_auto_authorizations_guard on public.house_auto_authorizations;

create trigger trg_house_auto_authorizations_guard before update or delete on public.house_auto_authorizations
for each row execute function public.house_auto_authorizations_guard();

-- ============ 4) a casa autoriza (grava o aceite e o texto exato que ela viu) ============
create or replace function public.platform_card_authorize(p_version text, p_plan text, p_amount bigint, p_period text, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid; hdr json; ip_txt text; ua text; cid uuid; aid uuid;
begin
if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then raise exception 'Somente a casa autoriza a cobrança automática.'; end if;
if coalesce(btrim(p_version), '') = '' or char_length(p_version) > 60 then raise exception 'Versão inválida.'; end if;
if p_period is null or p_period not in ('mensal', 'trimestral', 'anual') then raise exception 'Periodicidade inválida.'; end if;
if p_amount is not null and p_amount < 0 then raise exception 'Valor inválido.'; end if;
if coalesce(char_length(btrim(p_text)), 0) < 20 or char_length(p_text) > 1500 then raise exception 'Texto da autorização inválido.'; end if;
begin
hdr := nullif(current_setting('request.headers', true), '')::json;
exception when others then
hdr := null;
end;
ip_txt := nullif(btrim(split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), '');
ua := left(coalesce(hdr ->> 'user-agent', ''), 300);
insert into public.legal_consents (user_id, doc_key, doc_version, context_id, ip, user_agent)
values (auth.uid(), 'cobranca_automatica', btrim(p_version), h, ip_txt, nullif(ua, '')) returning id into cid;
insert into public.house_auto_authorizations (house_id, user_id, consent_id, plan_key, amount_cents, period, text_shown)
values (h, auth.uid(), cid, left(nullif(btrim(p_plan), ''), 40), p_amount, p_period, btrim(p_text)) returning id into aid;
return aid;
end $$;

-- ============ 5) o servidor confere antes de abrir o cadastro do cartão e antes de ligar a cobrança ============
create or replace function public.platform_card_auth_ok(p_house uuid, p_minutes int default 60) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from public.house_auto_authorizations a where a.house_id = p_house and a.created_at > now() - make_interval(mins => greatest(1, least(p_minutes, 1440))));
$$;

-- ============ 7) permissões ============
revoke all on public.house_auto_authorizations from anon, authenticated;

grant select on public.house_auto_authorizations to authenticated;

revoke all on function public.house_auto_authorizations_guard(), public.platform_card_authorize(text, text, bigint, text, text), public.platform_card_auth_ok(uuid, int) from public, anon, authenticated;

grant execute on function public.platform_card_authorize(text, text, bigint, text, text) to authenticated, service_role;

grant execute on function public.platform_card_auth_ok(uuid, int) to service_role;

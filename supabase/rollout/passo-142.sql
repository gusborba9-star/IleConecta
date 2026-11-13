-- PASSO 142: 0096_autorizacao_cobranca_automatica — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

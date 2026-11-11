-- 0076 — Aceite único (Fase 3, jornada 2): o aceite de dados sensíveis passa a valer até a pessoa retirar (antes, só 2 horas),
-- e a retirada fica registrada. O aceite dos Termos continua gravado uma vez por conta (termos_cliente / termos_casa).
-- Nada muda para quem ainda usa o app antigo: ele continua gravando o aceite a cada compra, e a regra nova também o aceita.
-- Aplicar ANTES de publicar o app novo (o app novo não grava mais o aceite a cada compra).
-- Rode no SQL Editor. É seguro repetir.

-- 1) A tabela de aceites passa a aceitar o registro de retirada da autorização de dados sensíveis.
alter table public.legal_consents drop constraint if exists legal_consents_doc_key_check;
alter table public.legal_consents add constraint legal_consents_doc_key_check
  check (doc_key = any (array['termos_cliente','checkout_ritual','checkout_servico','dados_sensiveis','dados_sensiveis_retirada','termos_casa']));

-- 2) Dados sensíveis: vale o aceite mais recente, até ser retirado (sem limite de 2 horas). Os demais documentos mantêm a regra de antes.
create or replace function public.has_recent_consent(p_user uuid, p_doc text, p_minutes integer default 120)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_doc = 'dados_sensiveis' then coalesce((
      select c.doc_key = 'dados_sensiveis'
        from public.legal_consents c
       where c.user_id = p_user and c.doc_key in ('dados_sensiveis', 'dados_sensiveis_retirada')
       order by c.accepted_at desc, c.id desc
       limit 1), false)
    else exists (select 1 from public.legal_consents c
                  where c.user_id = p_user and c.doc_key = p_doc and c.accepted_at > now() - make_interval(mins => p_minutes))
  end;
$$;
revoke all on function public.has_recent_consent(uuid, text, integer) from public, anon, authenticated;

-- 3) A pessoa retira a própria autorização de dados sensíveis (fica registrado, com data, versão, IP e navegador).
create or replace function public.withdraw_sensitive_consent(p_version text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  hdr json;
  ip_txt text;
  ua text;
  cid uuid;
  last_key text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if coalesce(btrim(p_version), '') = '' or char_length(p_version) > 60 then raise exception 'Versão inválida.'; end if;
  select c.doc_key into last_key
    from public.legal_consents c
   where c.user_id = auth.uid() and c.doc_key in ('dados_sensiveis', 'dados_sensiveis_retirada')
   order by c.accepted_at desc, c.id desc
   limit 1;
  if last_key is distinct from 'dados_sensiveis' then return null; end if;
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  ip_txt := nullif(btrim(split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), '');
  ua := left(coalesce(hdr ->> 'user-agent', ''), 300);
  insert into public.legal_consents (user_id, doc_key, doc_version, ip, user_agent)
  values (auth.uid(), 'dados_sensiveis_retirada', btrim(p_version), ip_txt, nullif(ua, ''))
  returning id into cid;
  return cid;
end $$;
revoke all on function public.withdraw_sensitive_consent(text) from public, anon;
grant execute on function public.withdraw_sensitive_consent(text) to authenticated;

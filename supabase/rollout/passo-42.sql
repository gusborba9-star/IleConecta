-- PASSO 42: 0076 — função para retirar a autorização de dados sensíveis
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

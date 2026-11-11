-- Reversão da 0076: volta o aceite de dados sensíveis para "feito nas últimas 2 horas" e remove a função de retirada.
-- A opção nova na tabela de aceites (dados_sensiveis_retirada) é mantida de propósito: apagar o registro de retirada apagaria prova.
create or replace function public.has_recent_consent(p_user uuid, p_doc text, p_minutes integer default 120)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.legal_consents c
                  where c.user_id = p_user and c.doc_key = p_doc and c.accepted_at > now() - make_interval(mins => p_minutes));
$$;
revoke all on function public.has_recent_consent(uuid, text, integer) from public, anon, authenticated;
drop function if exists public.withdraw_sensitive_consent(text);

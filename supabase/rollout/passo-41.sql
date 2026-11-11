-- PASSO 41: 0076 — aceite de dados sensíveis vale até ser retirado
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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

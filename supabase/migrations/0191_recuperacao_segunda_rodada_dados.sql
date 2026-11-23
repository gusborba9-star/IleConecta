-- 0191 — Segunda rodada: devolve à própria pessoa o que ELA informou na primeira (nunca dados da conta).
-- Exige o código do pedido (impossível de adivinhar) E o mesmo e-mail de contato. A palavra de segurança nunca foi gravada.
create or replace function public.recovery_parent_info(p_parent uuid, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('claimed', r.claimed, 'answers', r.answers)
    from public.account_recovery_requests r
   where r.id = p_parent and r.status = 'segunda_rodada' and r.contact_email_key = p_key
$$;
revoke all on function public.recovery_parent_info(uuid, text) from public, anon, authenticated;
grant execute on function public.recovery_parent_info(uuid, text) to service_role;

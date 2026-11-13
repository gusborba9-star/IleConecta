-- PASSO 143: 0096_autorizacao_cobranca_automatica — parte 4 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

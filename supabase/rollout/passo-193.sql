-- PASSO 193: 0106_conta_reutilizada — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0106 — Conta reutilizada (decisão do proprietário, 13/11/2026, opção B): quem volta com o e-mail de uma conta excluída é MARCADO, sem ser impedido.
--  (1) a marca usa o registro de identidade que já é retido por 5 anos (deleted_account_identity); não há dado novo guardado;
--  (2) o e-mail é comparado em forma normalizada (minúsculas, sem "+apelido", sem pontos em gmail), para não ser driblado por variação simples;
--  (3) o reembolso integral de 7 dias do plano NÃO vale de novo se uma conta anterior do mesmo e-mail já o usou (no servidor);
--  (4) o administrador vê a lista de contas reutilizadas, consulta o histórico retido (motivo obrigatório, fica registrado) e envia aviso
--      pela plataforma com texto-modelo neutro (só fatos do registro; o e-mail pode ter sido reaproveitado por outra pessoa).

-- ============ 1) comparação de e-mail ============
create or replace function public.email_key(p_email text) returns text
language sql immutable parallel safe set search_path = public as $$
select case when p_email is null or position('@' in p_email) = 0 then null else
  case when split_part(lower(btrim(p_email)), '@', 2) in ('gmail.com', 'googlemail.com')
    then replace(split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1) || '@' || split_part(lower(btrim(p_email)), '@', 2) end
end;
$$;

create index if not exists deleted_account_identity_email_key on public.deleted_account_identity (public.email_key(email));

-- identidades excluídas com o mesmo e-mail (normalizado) de uma conta atual
create or replace function public.account_prior_deleted(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
select di.user_id from public.deleted_account_identity di
where di.user_id <> p_user and di.email is not null
  and public.email_key(di.email) = public.email_key((select u.email from auth.users u where u.id = p_user));
$$;

-- a casa pertence a quem já usou o reembolso de 7 dias numa conta anterior com o mesmo e-mail?
create or replace function public.house_owner_refund_used_before(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (
  select 1 from public.houses h, lateral public.account_prior_deleted(h.owner_id) pd(uid)
  join public.houses ph on ph.owner_id = pd.uid
  join public.platform_plan_refunds r on r.house_id = ph.id and r.status in ('pendente', 'concluido')
  where h.id = p_house);
$$;

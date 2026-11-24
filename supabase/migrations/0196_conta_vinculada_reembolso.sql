-- 0196 — Conta vinculada por e-mail: o reembolso de 7 dias não se repete mesmo com a conta anterior ainda ATIVA (decisão do proprietário, 23/11/2026).
-- Antes (0106/0107, parecer do advogado): o reembolso só era negado quando uma conta EXCLUÍDA do mesmo e-mail já o tinha usado.
-- Brecha: depois da troca de e-mail (0184) o e-mail antigo fica livre; uma conta nova com ele não era ligada à conta original, que continua ativa.
-- Agora: qualquer OUTRA conta que compartilhe um e-mail vinculado (atual ou anterior, dentro dos 5 anos) conta como "conta anterior vinculada".
-- Mantém o parecer do advogado: o direito de 7 dias só é negado quando a outra conta JÁ USOU o reembolso (pendente ou concluído). Nada é bloqueado antes disso.
-- A marca "conta reutilizada" e o painel dos excluídos continuam como estavam (0106/0184). Esta migração só amplia a regra do reembolso e dá ao admin a lista de e-mails compartilhados.

-- ============ 1) outras contas que compartilham um e-mail vinculado ============
create or replace function public.account_linked_others(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
select distinct l2.user_id
from public.account_linked_emails l1
join public.account_linked_emails l2 on l2.email_key = l1.email_key and l2.user_id <> l1.user_id
where l1.user_id = p_user and l1.retain_until > now() and l2.retain_until > now();
$$;

-- ============ 2) a casa já teve reembolso de 7 dias usado por outra conta do mesmo e-mail? (excluída OU ativa) ============
create or replace function public.house_owner_refund_used_before(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (
  select 1 from public.houses h,
    lateral (select x as uid from public.account_prior_deleted(h.owner_id) x
             union select y from public.account_linked_others(h.owner_id) y) pd
  join public.houses ph on ph.owner_id = pd.uid
  join public.platform_plan_refunds r on r.house_id = ph.id and r.status in ('pendente', 'concluido')
  where h.id = p_house);
$$;

-- ============ 3) admin: contas ativas que compartilham e-mail com outra conta ============
create or replace function public.admin_shared_email_accounts() returns table(
  user_id uuid, account_type text, display_name text, email_masked text, joined_at timestamptz,
  others jsonb, refund_used boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('comunicacao') then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select p.id, p.account_type::text, p.display_name,
           left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2),
           u.created_at,
           (select coalesce(jsonb_agg(jsonb_build_object(
                'nome', coalesce(op.display_name, 'Conta excluída'),
                'situacao', case when op.id is null or op.deleted_at is not null then 'excluída' else 'ativa' end,
                'desde', ou.created_at,
                'reembolso_usado', exists (select 1 from public.houses oh join public.platform_plan_refunds r on r.house_id = oh.id and r.status in ('pendente', 'concluido') where oh.owner_id = o.uid)
              ) order by ou.created_at), '[]'::jsonb)
              from public.account_linked_others(p.id) o(uid)
              left join public.profiles op on op.id = o.uid
              left join auth.users ou on ou.id = o.uid),
           exists (select 1 from public.houses h join public.platform_plan_refunds r on r.house_id = h.id and r.status in ('pendente', 'concluido') where h.owner_id = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    where p.deleted_at is null and exists (select 1 from public.account_linked_others(p.id))
    order by u.created_at desc;
end $$;

revoke all on function public.account_linked_others(uuid), public.admin_shared_email_accounts() from public, anon;
revoke all on function public.account_linked_others(uuid) from authenticated;
grant execute on function public.admin_shared_email_accounts() to authenticated;

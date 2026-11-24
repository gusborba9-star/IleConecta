-- 0202 — O cartão do pagador é SÓ sinal para análise humana (parecer do advogado, 24/11/2026).
-- O art. 49 do CDC dá o direito de arrependimento ao contratante daquele serviço; negar o reembolso de 7 dias de forma automática só porque o mesmo
-- cartão já foi usado em outra conta poderia ferir quem paga legitimamente (ex.: pai que paga a Casa do filho). Por isso a regra do reembolso volta a
-- olhar só e-mail vinculado e conta excluída (0196/0107). O cartão continua gravado e aparece como sinal forte no painel "mesma pessoa"
-- (com "já usou o reembolso de 7 dias"), e a administração decide caso a caso: devolve o dinheiro e, se for a mesma Casa, suspende por abuso de direito.
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

-- sem uso: a regra do reembolso era o único lugar que a chamava
drop function if exists public.account_card_others(uuid);

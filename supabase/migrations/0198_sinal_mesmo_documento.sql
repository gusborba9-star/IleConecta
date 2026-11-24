-- 0198 — Sinal "mesmo CPF/CNPJ" nos sinais de mesma pessoa (23/11/2026).
-- O CPF/CNPJ da casa já é guardado, criptografado, para poder contratar plano (0126); nada novo é coletado.
-- A comparação acontece dentro da função (o número nunca é devolvido nem exibido): o admin só vê que o documento é o mesmo.
-- É sinal FORTE, mas só uma pista: o mesmo responsável pode ter, legitimamente, mais de uma Casa. Decide a administração, caso a caso.
create or replace function public.admin_same_person_signals() returns table(
  user_id uuid, account_type text, display_name text, email_masked text, joined_at timestamptz,
  nivel text, others jsonb, refund_used boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.admin_can('comunicacao') then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
  with docs as (
    -- o documento é comparado por dentro e nunca sai da função: a resposta só diz que "o documento é o mesmo"
    select h.owner_id, pgp_sym_decrypt(t.doc_enc, public.tax_id_key()) as d
      from public.house_tax_ids t join public.houses h on h.id = t.house_id
  ), ips as (
    select l.user_id as uid, l.ip from public.access_logs l where l.user_id is not null and l.purge_after > now() group by l.user_id, l.ip
  ), ip_pop as (
    select ips.ip, count(*) n from ips group by ips.ip
  ), cand as (
    select a.user_id as ua, b.user_id as ub, 'aparelho'::text as sinal
      from public.security_devices a join public.security_devices b on a.device_hash = b.device_hash and a.user_id < b.user_id
    union all
    select a.uid, b.uid, 'rede'::text
      from ips a join ips b on a.ip = b.ip and a.uid < b.uid join ip_pop p on p.ip = a.ip where p.n <= 10
    union all
    select a.owner_id, b.owner_id, 'documento'::text
      from docs a join docs b on a.d = b.d and a.owner_id < b.owner_id
  ), pairs as (
    select c.ua, c.ub, array_agg(distinct c.sinal) as sinais from cand c group by c.ua, c.ub
  ), live as (
    select p.id as uid, p.display_name as nome, p.account_type::text as tipo, u.created_at as criada, u.email as mail
      from public.profiles p join auth.users u on u.id = p.id where p.deleted_at is null
  ), rated as (
    select pr.ua, pr.ub, pr.sinais,
           case when pr.sinais && array['aparelho','documento'] or abs(extract(epoch from (la.criada - lb.criada))) <= 14 * 86400 then 'forte' else 'fraco' end as nivel
      from pairs pr join live la on la.uid = pr.ua join live lb on lb.uid = pr.ub
  ), sides as (
    select r.ua as me, r.ub as other, r.sinais, r.nivel from rated r
    union all
    select r.ub, r.ua, r.sinais, r.nivel from rated r
  )
  select s.me, lm.tipo, lm.nome,
         left(split_part(lm.mail, '@', 1), 2) || '***@' || split_part(lm.mail, '@', 2),
         lm.criada,
         case when bool_or(s.nivel = 'forte') then 'forte' else 'fraco' end,
         jsonb_agg(jsonb_build_object(
           'nome', lo.nome, 'tipo', lo.tipo, 'desde', lo.criada, 'sinais', to_jsonb(s.sinais), 'nivel', s.nivel,
           'reembolso_usado', exists (select 1 from public.houses oh join public.platform_plan_refunds r2 on r2.house_id = oh.id and r2.status in ('pendente', 'concluido') where oh.owner_id = s.other)
         ) order by lo.criada),
         exists (select 1 from public.houses h join public.platform_plan_refunds r3 on r3.house_id = h.id and r3.status in ('pendente', 'concluido') where h.owner_id = s.me)
    from sides s join live lm on lm.uid = s.me join live lo on lo.uid = s.other
    group by s.me, lm.tipo, lm.nome, lm.criada, lm.mail
    order by 6, lm.criada desc;
end $$;

revoke all on function public.admin_same_person_signals() from public, anon;
grant execute on function public.admin_same_person_signals() to authenticated;

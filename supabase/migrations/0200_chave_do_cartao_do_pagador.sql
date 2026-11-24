-- 0200 — Chave do cartão do pagador como SINAL (decisão do proprietário, 24/11/2026; o advogado confirmou que pode, sem barrar a contratação paga).
-- Problema: a casa troca de e-mail e de conta, usa o plano por 6 dias e pede reembolso de novo; o e-mail e o CPF/CNPJ já ligam contas, mas o mesmo
-- cartão também liga. O Stripe devolve uma "impressão" do cartão (fingerprint, igual para o mesmo cartão); guardamos só um hash dela com chave do servidor.
-- Nunca guardamos número, validade ou bandeira aqui. Nada é bloqueado: a chave só (1) aparece como sinal forte no painel "mesma pessoa" e
-- (2) entra na regra do reembolso de 7 dias, que continua sendo negado SOMENTE quando a outra conta ligada JÁ USOU o reembolso (parecer do advogado, 0107/0196).
-- Sem chave estrangeira de propósito: a marca sobrevive à exclusão da conta, como os e-mails vinculados (0184). Guarda de 24 meses desde o último uso.
-- Pix não gera impressão (o CPF/CNPJ da casa, 0198, já cobre esse caso).

create table if not exists public.payer_card_keys (
  user_id uuid not null,
  key_hash text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  retain_until timestamptz not null default now() + interval '24 months',
  primary key (user_id, key_hash)
);
create index if not exists payer_card_keys_hash_idx on public.payer_card_keys (key_hash);
alter table public.payer_card_keys enable row level security;
revoke all on table public.payer_card_keys from public, anon, authenticated;

insert into public.app_secrets (key, value) values ('payer_salt', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;

-- ============ 1) registra a chave (só o servidor de cobrança chama) ============
create or replace function public.payer_key_record(p_user uuid, p_fingerprint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_salt text; v_hash text;
begin
  if p_user is null or p_fingerprint is null or p_fingerprint !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  select value into v_salt from public.app_secrets where key = 'payer_salt';
  if v_salt is null then return false; end if;
  v_hash := encode(extensions.digest(p_fingerprint || ':' || v_salt, 'sha256'), 'hex');
  insert into public.payer_card_keys (user_id, key_hash) values (p_user, v_hash)
  on conflict (user_id, key_hash) do update set last_seen = now(), retain_until = now() + interval '24 months';
  return true;
end $$;

-- ============ 2) outras contas que usaram o mesmo cartão ============
create or replace function public.account_card_others(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
select distinct b.user_id
from public.payer_card_keys a
join public.payer_card_keys b on b.key_hash = a.key_hash and b.user_id <> a.user_id
where a.user_id = p_user and a.retain_until > now() and b.retain_until > now();
$$;

-- ============ 3) reembolso de 7 dias: contas ligadas por e-mail, por conta excluída OU por cartão ============
create or replace function public.house_owner_refund_used_before(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (
  select 1 from public.houses h,
    lateral (select x as uid from public.account_prior_deleted(h.owner_id) x
             union select y from public.account_linked_others(h.owner_id) y
             union select z from public.account_card_others(h.owner_id) z) pd
  join public.houses ph on ph.owner_id = pd.uid
  join public.platform_plan_refunds r on r.house_id = ph.id and r.status in ('pendente', 'concluido')
  where h.id = p_house);
$$;

-- ============ 4) painel "mesma pessoa": o cartão é sinal forte (a impressão nunca sai da função) ============
create or replace function public.admin_same_person_signals() returns table(
  user_id uuid, account_type text, display_name text, email_masked text, joined_at timestamptz,
  nivel text, others jsonb, refund_used boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.admin_can('comunicacao') then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
  with docs as (
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
    union all
    select a.user_id, b.user_id, 'cartao'::text
      from public.payer_card_keys a join public.payer_card_keys b on a.key_hash = b.key_hash and a.user_id < b.user_id
     where a.retain_until > now() and b.retain_until > now()
  ), pairs as (
    select c.ua, c.ub, array_agg(distinct c.sinal) as sinais from cand c group by c.ua, c.ub
  ), live as (
    select p.id as uid, p.display_name as nome, p.account_type::text as tipo, u.created_at as criada, u.email as mail
      from public.profiles p join auth.users u on u.id = p.id where p.deleted_at is null
  ), rated as (
    select pr.ua, pr.ub, pr.sinais,
           case when pr.sinais && array['aparelho','documento','cartao'] or abs(extract(epoch from (la.criada - lb.criada))) <= 14 * 86400 then 'forte' else 'fraco' end as nivel
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

-- ============ 5) limpeza diária das chaves vencidas ============
select cron.schedule('payer-keys-purge', '43 4 * * *', $job$ delete from public.payer_card_keys where retain_until < now(); $job$);

revoke all on function public.payer_key_record(uuid, text), public.account_card_others(uuid), public.admin_same_person_signals() from public, anon, authenticated;
grant execute on function public.payer_key_record(uuid, text) to service_role;
grant execute on function public.admin_same_person_signals() to authenticated;

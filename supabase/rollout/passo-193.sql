-- PASSO 193: 0106_conta_reutilizada — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0106 — Conta reutilizada (decisão do proprietário, 13/11/2026, opção B): quem volta com o e-mail de uma conta excluída é MARCADO, sem ser impedido.
--  (1) a marca usa o registro de identidade que já é retido por 5 anos (deleted_account_identity); não há dado novo guardado;
--  (2) o e-mail é comparado em forma normalizada (minúsculas, sem "+apelido", sem pontos em gmail), para não ser driblado por variação simples;
--  (3) conta reutilizada NÃO inclui o reembolso de 7 dias do plano (decisão do proprietário; no servidor), com a mensagem "Conta reutilizada: o reembolso de 7 dias não está incluído.";
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

-- a casa pertence a quem já teve uma conta excluída com o mesmo e-mail?
create or replace function public.house_owner_is_returning(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from public.houses h, lateral public.account_prior_deleted(h.owner_id) pd(uid) where h.id = p_house);
$$;

-- ============ 2) reembolso de 7 dias com a nova regra ============
create or replace function public.platform_plan_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; r public.platform_plan_refunds; v_first uuid; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'plan' or c.status <> 'paga' then raise exception 'Esta cobrança não pode ser reembolsada.'; end if;
if public.house_owner_is_returning(p_house) then raise exception 'Conta reutilizada: o reembolso de 7 dias não está incluído.'; end if;
select * into r from public.platform_plan_refunds where house_id = p_house and status in ('pendente', 'concluido');
if found then
if r.charge_id <> p_charge then raise exception 'O reembolso de 7 dias do plano já foi usado por esta casa.'; end if;
if r.status = 'concluido' then raise exception 'Esta cobrança já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
select id into v_first from public.platform_charges where house_id = p_house and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
if v_first is distinct from p_charge then raise exception 'O reembolso de 7 dias vale só para o primeiro pagamento do plano.'; end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
insert into public.platform_plan_refunds (charge_id, house_id, amount_cents, provider, requested_by) values (c.id, c.house_id, c.paid_amount_cents, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', c.paid_amount_cents, 'resume', false);
end $$;

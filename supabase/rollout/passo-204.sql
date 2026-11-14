-- PASSO 204: 0108_contratacao_de_plano_no_app — parte 5 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- o que a casa vê em Planos: plano, troca agendada e o valor de cada upgrade (ou o motivo de não estar disponível)
create or replace function public.my_plan_change_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; bp public.house_billing_plan; p text; ups jsonb := '{}'::jsonb; blk jsonb := '{}'::jsonb; v_reason text; canc boolean;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then return jsonb_build_object('has_house', false); end if;
select coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h.id), false) into canc;
select * into bp from public.house_billing_plan where house_id = h.id and active;
if not found then return jsonb_build_object('has_house', true, 'subscribed', false, 'cancelled', canc, 'plan', h.plan::text); end if;
v_reason := public.platform_plan_change_block_reason(h.id, d);
foreach p in array array['intermediario', 'maximo'] loop
continue when public.platform_plan_rank(p) <= public.platform_plan_rank(h.plan::text);
begin
ups := ups || jsonb_build_object(p, public.platform_upgrade_quote(h.id, p, d));
exception when others then
blk := blk || jsonb_build_object(p, sqlerrm);
end;
end loop;
return jsonb_build_object('has_house', true, 'subscribed', true, 'cancelled', canc, 'plan', h.plan::text, 'pending_plan', bp.pending_plan, 'pending_on', bp.pending_plan_on,
'upgrades', ups, 'upgrade_blocked', blk, 'downgrade_blocked', v_reason);
end $$;

-- ============ 7) fatura de assinatura/upgrade esquecida em aberto: sem lembretes, sem cartão automático, sem atraso ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date; f public.house_card_on_file; auto boolean := false;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
-- fatura de reativação, assinatura ou upgrade é pedida pela própria casa na hora: sem lembretes de fatura
if c.idempotency_key ~ '^(reativacao|assinatura|upgrade):' then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
select * into f from public.house_card_on_file where house_id = c.house_id;
auto := found and f.auto_enabled and f.method_ref is not null and c.kind in ('plan', 'extra_seat') and c.due_date >= f.saved_on and public.billing_auto_card_enabled()
and not exists (select 1 from public.platform_auto_attempts t where t.charge_id = c.id and t.outcome in ('recusada', 'exige_acao'));
msg := case p_stage
when 'fatura_disponivel' then case when auto then 'Sua fatura da plataforma vence em ' || to_char(c.due_date, 'DD/MM') || ' e será cobrada automaticamente no cartão final ' || coalesce(f.last4, '') || ' nesse dia. Você pode pagar antes ou trocar o cartão em Planos.'
else 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.' end
when 'vespera' then case when auto then 'Amanhã (' || to_char(c.due_date, 'DD/MM') || ') cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '. Confira se o cartão está dentro da validade e com limite.'
else 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').' end
when 'dia_vencimento' then case when auto then 'Hoje cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '.' else 'Sua fatura da plataforma vence hoje.' end
when 'suspensao' then 'Sua casa está com a suspensão parcial: sem vendas novas, campanhas, destaque, impulsionamento e assistente. Pague a fatura para voltar ao normal.'
when 'total_em_breve' then 'Atenção: se a fatura da plataforma continuar em aberto, sua casa será bloqueada por completo em ' || to_char(tol_end + public.billing_total_days() + 1, 'DD/MM') || '. Pague para evitar.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

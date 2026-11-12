-- PASSO 83: 0088_cobranca_motor — parte 8 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) avisos (sino da casa; texto sem cobrança de culpa, sem selo) ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
msg := case p_stage
when 'fatura_disponivel' then 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.'
when 'vespera' then 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').'
when 'dia_vencimento' then 'Sua fatura da plataforma vence hoje.'
when 'suspensao' then 'Sua casa está com a suspensão parcial: sem vendas novas, campanhas, destaque, impulsionamento e assistente. Pague a fatura para voltar ao normal.'
when 'total_em_breve' then 'Atenção: se a fatura da plataforma continuar em aberto, sua casa será bloqueada por completo em ' || to_char(tol_end + public.billing_total_days() + 1, 'DD/MM') || '. Pague para evitar.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

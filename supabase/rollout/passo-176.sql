-- PASSO 176: 0101_cancelamento_e_tela_unica — parte 2 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) funções internas ============
-- próxima renovação da casa: a fatura de plano ainda em aberto que vem pela frente, ou o próximo dia de cobrança depois de hoje
create or replace function public.platform_house_next_renewal(p_house uuid, p_today date)
returns date language plpgsql stable security definer set search_path = public as $$
declare v date; pl public.house_billing_plan; c date;
begin
select min(period_start) into v from public.platform_charges where house_id = p_house and kind = 'plan' and status = 'aberta' and period_start >= p_today and idempotency_key not like 'reativacao:%';
if v is not null then return v; end if;
select * into pl from public.house_billing_plan where house_id = p_house and active;
if not found then return null; end if;
c := date_trunc('month', p_today)::date + (pl.billing_day - 1);
if c <= p_today then c := (date_trunc('month', p_today) + interval '1 month')::date + (pl.billing_day - 1); end if;
return c;
end $$;

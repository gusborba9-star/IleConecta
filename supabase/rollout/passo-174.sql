-- PASSO 174: 0100_reajuste_tabela_comercial — parte 10 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- aplica reajustes vencidos todo dia (de hora em hora, conferido pela data de Brasília)
select cron.unschedule('platform-price-apply') where exists (select 1 from cron.job where jobname = 'platform-price-apply');

select cron.schedule('platform-price-apply', '10 * * * *', $job$ select public.platform_price_apply_due() $job$);

-- ============ 7) permissões ============
revoke all on public.platform_price_changes from anon, authenticated;

grant select on public.platform_price_changes to authenticated;

revoke all on function public.platform_price_changes_guard(), public.platform_plan_monthly_cents(text, date), public.admin_price_announce(text, numeric, date, text), public.admin_price_cancel(uuid, text),
public.platform_price_apply_due(timestamptz), public.platform_pricing_increase_guard() from public, anon, authenticated;

grant execute on function public.platform_plan_monthly_cents(text, date), public.platform_price_apply_due(timestamptz) to service_role;

grant execute on function public.admin_price_announce(text, numeric, date, text), public.admin_price_cancel(uuid, text) to authenticated, service_role;

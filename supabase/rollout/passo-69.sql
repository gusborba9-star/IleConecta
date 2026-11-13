-- PASSO 69: 0086_painel_financeiro_admin — parte 4 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.admin_finance_anomalies()
returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
insert into public.admin_audit (admin_id, key, old_value, new_value)
values (auth.uid(), 'finance_view', null, jsonb_build_object('tab', 'conferencia'));
with an as (
select * from public.finance_anomalies_a() union all select * from public.finance_anomalies_b()
), top as (
select * from an order by case severity when 'alta' then 0 when 'media' then 1 else 2 end, at desc limit 200
)
select jsonb_build_object('generated_at', now(), 'total', (select count(*) from an), 'shown', (select count(*) from top),
'counts', (select coalesce(jsonb_object_agg(code, n), '{}'::jsonb) from (select code, count(*) n from an group by code) c),
'items', (select coalesce(jsonb_agg(to_jsonb(t) order by case t.severity when 'alta' then 0 when 'media' then 1 else 2 end, t.at desc), '[]'::jsonb) from top t),
'scope', 'Confere pagamentos, livro-razão, regra de comissão e reembolsos do nosso banco. Não consulta o Stripe.')
into res;
return res;
end $$;

-- ============ 3) permissões ============
revoke all on function public.finance_anomalies_a(), public.finance_anomalies_b(), public.admin_finance_summary(int), public.admin_finance_anomalies() from public, anon, authenticated;

grant execute on function public.admin_finance_summary(int), public.admin_finance_anomalies() to authenticated;

grant execute on function public.finance_anomalies_a(), public.finance_anomalies_b() to service_role;

-- PASSO 103: 0091_creditos_de_ia — parte 5 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.my_house_billing_status(p_house uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p_h uuid := p_house; cfg jsonb := public.platform_billing_config(); d date := (now() at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); lvl text; s public.house_billing_state; items jsonb;
begin
if p_h is null then select id into p_h from public.houses where owner_id = auth.uid() limit 1; end if;
if p_h is null then return jsonb_build_object('house_id', null, 'level', 'ok', 'overdue', false, 'charges', '[]'::jsonb); end if;
if not (public.is_admin() or public.is_house_owner(p_h)) then raise exception 'not_allowed' using errcode = '42501'; end if;
lvl := public.house_billing_level(p_h);
select * into s from public.house_billing_state where house_id = p_h;
select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'description', c.description, 'amount_cents', c.amount_cents, 'due_date', c.due_date, 'status', c.status, 'methods', coalesce(cfg -> 'methods' -> c.kind, '[]'::jsonb),
'tolerance_end', public.billing_add_business_days(c.due_date, tol), 'total_on', public.billing_add_business_days(c.due_date, tol) + tdays + 1) order by c.due_date), '[]'::jsonb)
into items from public.platform_charges c where c.house_id = p_h and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida','em_processamento') and c.due_date < d;
return jsonb_build_object('house_id', p_h, 'level', lvl, 'overdue', jsonb_array_length(items) > 0, 'charges', items, 'partial_since', s.since, 'total_since', s.total_since);
end $$;

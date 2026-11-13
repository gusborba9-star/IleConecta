-- PASSO 74: 0087_cobranca_base — parte 5 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- n-ésimo dia útil depois de d (n = 0 devolve d mesmo que não seja útil; n > 0 conta só dias úteis, nunca o próprio d)
create or replace function public.billing_add_business_days(d date, n int) returns date
language plpgsql stable security definer set search_path = public as $$
declare cur date := d; left_n int := n;
begin
if d is null or n is null or n < 0 or n > 60 then raise exception 'Parâmetros inválidos para dias úteis.'; end if;
while left_n > 0 loop
cur := cur + 1;
if public.billing_is_business_day(cur) then left_n := left_n - 1; end if;
end loop;
return cur;
end $$;

-- feriado: o administrador inclui ou remove (motivo implícito no nome; fica no histórico)
create or replace function public.admin_set_billing_holiday(p_day date, p_name text, p_remove boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_day is null or p_day < date '2026-01-01' or p_day > date '2035-12-31' then raise exception 'Data fora do intervalo permitido.'; end if;
if p_remove then
delete from public.billing_holidays where day = p_day;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_holiday', jsonb_build_object('day', p_day), jsonb_build_object('removed', true));
return;
end if;
if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Informe o nome do feriado (2 a 80 caracteres).'; end if;
insert into public.billing_holidays (day, name) values (p_day, btrim(p_name)) on conflict (day) do update set name = excluded.name;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_holiday', null, jsonb_build_object('day', p_day, 'name', btrim(p_name)));
end $$;

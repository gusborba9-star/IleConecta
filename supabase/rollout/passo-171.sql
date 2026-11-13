-- PASSO 171: 0100_reajuste_tabela_comercial — parte 7 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.admin_price_cancel(p_change uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.platform_price_changes; v_n integer; v_name text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
select * into c from public.platform_price_changes where id = p_change for update;
if not found or c.status <> 'anunciado' then raise exception 'Este reajuste não está mais anunciado.'; end if;
update public.platform_price_changes set status = 'cancelado' where id = c.id;
select value -> 'plans' -> c.plan ->> 'name' into v_name from public.platform_settings where key = 'pricing';
insert into public.notifications (user_id, text, href)
select distinct h.owner_id, 'Atualização da tabela comercial cancelada: o plano ' || coalesce(v_name, c.plan) || ' continua em R$ ' || replace(to_char(c.old_cents / 100.0, 'FM9999990.00'), '.', ',') || ' por mês. O aviso anterior de reajuste não vale mais.', '/planos'
from public.houses h join public.house_billing_plan b on b.house_id = h.id and b.active where h.plan::text = c.plan and h.owner_id is not null;
get diagnostics v_n = row_count;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'price_cancel', null, jsonb_build_object('change', c.id, 'reason', left(btrim(p_reason), 300)));
return v_n;
end $$;

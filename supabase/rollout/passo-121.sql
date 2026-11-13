-- PASSO 121: 0094_cobranca_automatica_cartao — parte 7 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_card_set_auto(p_house uuid, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare f public.house_card_on_file; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
select * into f from public.house_card_on_file where house_id = p_house for update;
if not found or f.method_ref is null then raise exception 'Cadastre um cartão primeiro.'; end if;
if f.auto_enabled = p_enabled then return p_enabled; end if;
-- ao religar, só valem faturas que vencem de hoje em diante (nunca cobra de surpresa uma fatura que já passou)
update public.house_card_on_file set auto_enabled = p_enabled, saved_on = case when p_enabled then v_today else saved_on end, updated_at = now() where house_id = p_house;
return p_enabled;
end $$;

create or replace function public.platform_card_remove(p_house uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
select method_ref into v from public.house_card_on_file where house_id = p_house for update;
update public.house_card_on_file set method_ref = null, brand = null, last4 = null, exp_month = null, exp_year = null, auto_enabled = false, updated_at = now() where house_id = p_house;
return v;
end $$;

-- PASSO 82: 0088_cobranca_motor — parte 7 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) provedor: guardar a referência (uma vez), andamento do pagamento e confirmação ============
create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida','em_processamento') then raise exception 'Fatura não está em aberto.'; end if;
if c.provider_ref is not null and (c.provider is distinct from p_provider or c.provider_ref is distinct from p_ref) then raise exception 'referencia_ja_definida'; end if;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;

create or replace function public.platform_charge_progress(p_provider text, p_ref text, p_state text, p_now timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; ns text; d date := (p_now at time zone 'America/Sao_Paulo')::date;
begin
if p_state not in ('processing','failed') then raise exception 'Estado inválido.'; end if;
select * into c from public.platform_charges where provider = p_provider and provider_ref = p_ref for update;
if not found then raise exception 'cobranca_desconhecida'; end if;
if c.status in ('paga','cancelada','estornada') then return c.status; end if;
ns := case when p_state = 'processing' then 'em_processamento' when c.due_date < d then 'vencida' else 'aberta' end;
if ns <> c.status then update public.platform_charges set status = ns where id = c.id; end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return ns;
end $$;

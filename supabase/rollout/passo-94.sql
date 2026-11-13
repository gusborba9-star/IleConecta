-- PASSO 94: 0089_cobranca_tentativas_e_card — parte 3 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) achar a fatura pela referência (atual ou antiga) ============
create or replace function public.platform_charge_of_ref(p_provider text, p_ref text) returns uuid
language sql stable security definer set search_path = public as $$
select coalesce((select r.charge_id from public.platform_charge_refs r where r.provider = p_provider and r.ref = p_ref),
(select c.id from public.platform_charges c where c.provider = p_provider and c.provider_ref = p_ref));
$$;

create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; other uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida') then raise exception 'Fatura não aceita nova página de pagamento agora.'; end if;
other := public.platform_charge_of_ref(p_provider, p_ref);
if other is not null and other <> p_charge then raise exception 'referencia_de_outra_fatura'; end if;
insert into public.platform_charge_refs (charge_id, provider, ref) values (p_charge, p_provider, p_ref) on conflict (provider, ref) do nothing;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;

-- ============ 4) andamento e confirmação: valem para qualquer referência da fatura; duplicidade vira evento visível ============
create or replace function public.platform_charge_progress(p_provider text, p_ref text, p_state text, p_now timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; ns text; v_id uuid; d date := (p_now at time zone 'America/Sao_Paulo')::date;
begin
if p_state not in ('processing','failed') then raise exception 'Estado inválido.'; end if;
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status in ('paga','cancelada','estornada') then return c.status; end if;
if c.provider_ref is distinct from p_ref and p_state = 'failed' then return c.status; end if;
ns := case when p_state = 'processing' then 'em_processamento' when c.due_date < d then 'vencida' else 'aberta' end;
if ns <> c.status then update public.platform_charges set status = ns where id = c.id; end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return ns;
end $$;

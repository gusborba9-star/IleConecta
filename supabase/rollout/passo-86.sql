-- PASSO 86: 0088_cobranca_motor — parte 11 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 11) administrador: matricular casa no calendário de cobrança (nada é cobrado de quem não foi matriculado) ============
create or replace function public.admin_billing_enroll(p_house uuid, p_day int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
if p_day is null or p_day not between 1 and 28 then raise exception 'O dia de vencimento deve ficar entre 1 e 28.'; end if;
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (p_house, p_day, (now() at time zone 'America/Sao_Paulo')::date, true)
on conflict (house_id) do update set billing_day = excluded.billing_day, active = true, updated_at = now(),
started_on = case when public.house_billing_plan.active then public.house_billing_plan.started_on else excluded.started_on end;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_enroll', null, jsonb_build_object('house', p_house, 'day', p_day, 'reason', left(btrim(p_reason), 300)));
end $$;

create or replace function public.admin_billing_unenroll(p_house uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then raise exception 'A casa não está matriculada.'; end if;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_unenroll', null, jsonb_build_object('house', p_house, 'reason', left(btrim(p_reason), 300)));
end $$;

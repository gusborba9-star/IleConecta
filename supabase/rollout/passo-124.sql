-- PASSO 124: 0094_cobranca_automatica_cartao — parte 10 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- reserva a tentativa (trava a fatura): se mudou de estado nesse meio tempo, não cobra
create or replace function public.platform_auto_attempt_begin(p_charge uuid, p_attempt int, p_now timestamptz default now()) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; a public.platform_auto_attempts; f public.house_card_on_file;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.status not in ('aberta', 'vencida') or c.kind not in ('plan', 'extra_seat') then return false; end if;
select * into f from public.house_card_on_file where house_id = c.house_id;
if not found or f.method_ref is null or not f.auto_enabled then return false; end if;
select * into a from public.platform_auto_attempts where charge_id = p_charge and attempt = p_attempt;
if found then
if a.outcome <> 'iniciada' then return false; end if;
update public.platform_auto_attempts set updated_at = now() where id = a.id;
return true;
end if;
if p_attempt <> coalesce((select max(t.attempt) from public.platform_auto_attempts t where t.charge_id = p_charge), 0) + 1 then return false; end if;
if p_attempt > public.billing_auto_max_attempts() then return false; end if;
insert into public.platform_auto_attempts (charge_id, attempt, outcome, last4) values (p_charge, p_attempt, 'iniciada', f.last4);
return true;
end $$;

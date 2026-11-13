-- PASSO 178: 0101_cancelamento_e_tela_unica — parte 4 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- encerra a assinatura (mesmo estado final do reembolso do plano): cobrança mensal e cartão automático param, faturas ainda não vencidas são canceladas e a casa fica inativa
create or replace function public.platform_house_cancel_apply(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then return false; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then return false; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind in ('plan', 'extra_seat') and status = 'aberta';
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = p_house and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (p_house, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, cancel_at = null, cancel_charges = '{}', updated_at = now();
perform public.platform_house_billing_recompute(p_house, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_cancelada', 'processado', p_house::text);
select owner_id into v_owner from public.houses where id = p_house;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Assinatura cancelada. A casa está inativa e nenhuma nova cobrança será feita. Seus dados ficam guardados. Para voltar, entre na sua conta e escolha um plano.', '/planos');
end if;
return true;
end $$;

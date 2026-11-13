-- PASSO 179: 0101_cancelamento_e_tela_unica — parte 5 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- no dia agendado, a casa fica inativa
create or replace function public.platform_cancel_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0;
begin
for r in select house_id from public.house_billing_state where cancel_at is not null and cancel_at <= d and cancelled_at is null order by cancel_at loop
begin
if public.platform_house_cancel_apply(r.house_id, p_now) then n := n + 1; end if;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_cancelamento', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

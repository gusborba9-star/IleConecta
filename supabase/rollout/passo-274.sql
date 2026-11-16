-- PASSO 274: 0127_endurecimento_etapas_0123_0126 — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) Redução de vagas: uma aplicação só, mesmo com rotinas simultâneas
create or replace function public.platform_seat_release_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0; v_owner uuid;
begin
for r in select house_id, seats, release_to from public.house_extra_seats where release_on is not null and release_on <= d order by release_on for update skip locked loop
begin
update public.house_extra_seats set seats = least(seats, release_to), release_to = null, release_on = null where house_id = r.house_id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vagas_reduzidas', 'processado', r.house_id::text || ':' || r.seats || '>' || r.release_to);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'As vagas extras de equipe foram reduzidas na renovação, como você pediu.', '/equipe');
end if;
n := n + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_reducao_vagas', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

revoke all on function public.platform_seat_release_apply_due(timestamptz) from public, anon, authenticated;

grant execute on function public.platform_seat_release_apply_due(timestamptz) to service_role;

-- ============ 3) Permissões
revoke all on function public.house_seat_allowance(uuid) from public, anon;

grant execute on function public.house_seat_allowance(uuid) to authenticated, service_role;

revoke insert, update, delete, truncate on public.house_extra_seats from anon, authenticated;

revoke insert, update, delete, truncate on public.platform_settings from anon, authenticated;

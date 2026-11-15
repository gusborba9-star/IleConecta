-- PASSO 227: 0114_destaque_e_impulsionamento — parte 7 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- suspensão pausa o relógio; regularizar faz voltar a correr
create or replace function public.promotions_sync_pause() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paused boolean := public.promo_house_paused(new.house_id);
begin
if v_paused then
update public.promotions set pause_started_at = now() where house_id = new.house_id and status = 'ativa' and pause_started_at is null;
else
update public.promotions set paused_seconds = paused_seconds + round(extract(epoch from now() - pause_started_at))::bigint, pause_started_at = null
where house_id = new.house_id and status = 'ativa' and pause_started_at is not null;
end if;
return new;
end $$;

drop trigger if exists trg_promotions_sync_pause on public.house_billing_state;

create trigger trg_promotions_sync_pause after insert or update on public.house_billing_state
for each row execute function public.promotions_sync_pause();

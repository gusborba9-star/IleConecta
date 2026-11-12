-- PASSO 90: 0088_cobranca_motor — parte 15 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 12) suspensão parcial: nenhuma venda ou reserva nova pela plataforma, nenhuma campanha nova; o que já estava em andamento termina ============
create or replace function public.payments_billing_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
if new.member_due_id is not null then return new; end if;
h := coalesce((select e.house_id from public.reservations r join public.events e on e.id = r.event_id where r.id = new.reservation_id), (select o.house_id from public.service_orders o where o.id = new.order_id));
if h is null or not public.house_billing_blocked(h) then return new; end if;
if exists (select 1 from public.payments p where p.id is distinct from new.id and p.status in ('confirmado','estornado_parcial')
and ((new.reservation_id is not null and p.reservation_id = new.reservation_id) or (new.order_id is not null and p.order_id = new.order_id))) then return new; end if;
raise exception 'Esta casa não está recebendo novos pedidos pela plataforma no momento.';
end $$;

drop trigger if exists trg_payments_billing_block on public.payments;

create trigger trg_payments_billing_block before insert on public.payments
for each row execute function public.payments_billing_block();

create or replace function public.campaigns_billing_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if public.house_billing_blocked(new.house_id) then raise exception 'Novas campanhas ficam pausadas enquanto a fatura da plataforma estiver em atraso.'; end if;
return new;
end $$;

drop trigger if exists trg_house_campaigns_billing_block on public.house_campaigns;

create trigger trg_house_campaigns_billing_block before insert on public.house_campaigns
for each row execute function public.campaigns_billing_block();

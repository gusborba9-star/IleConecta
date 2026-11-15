-- PASSO 246: 0118_proposta_de_horario_pelo_chat — parte 4 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) Dados do cartão (casa e cliente da proposta)
create or replace function public.proposal_card(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.schedule_proposals%rowtype;
  svc public.services%rowtype;
  ord public.service_orders%rowtype;
  st text;
  me uuid := auth.uid();
begin
  select * into p from public.schedule_proposals where id = p_id;
  if not found or me is null or not (p.client_id = me or public.is_house_owner(p.house_id)) then return null; end if;
  select * into svc from public.services where id = p.service_id;
  st := p.status;
  if st = 'aberta' and p.expires_at <= now() then st := 'expirada'; end if;
  if p.order_id is not null then select * into ord from public.service_orders where id = p.order_id; end if;
  if ord.id is null then null;
  elsif ord.status in ('confirmado', 'em_andamento') then st := 'paga';
  elsif ord.status = 'concluido' then st := 'concluida';
  elsif ord.status in ('reembolso_pendente', 'reembolsado', 'cancelado') and st = 'aberta' then st := 'cancelada';
  end if;
  return jsonb_build_object(
    'id', p.id, 'status', st, 'service_id', p.service_id, 'service_title', coalesce(svc.title, 'Serviço'),
    'starts_at', p.starts_at, 'when', public.proposal_when_text(p.starts_at), 'price_cents', p.price_cents,
    'expires_at', p.expires_at, 'order_id', p.order_id, 'mine_is_house', public.is_house_owner(p.house_id));
end $$;

revoke all on function public.proposal_card(uuid) from public, anon;

grant execute on function public.proposal_card(uuid) to authenticated;

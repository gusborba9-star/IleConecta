-- PASSO 248: 0118_proposta_de_horario_pelo_chat — parte 6 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 10) A casa (ou o cliente, que recusa) cancela uma proposta aberta
create or replace function public.cancel_proposal(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare p public.schedule_proposals%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into p from public.schedule_proposals where id = p_id for update;
  if not found or not (p.client_id = auth.uid() or public.is_house_owner(p.house_id)) then raise exception 'Proposta não encontrada.'; end if;
  if p.status <> 'aberta' then return false; end if;
  if p.order_id is not null and exists (select 1 from public.service_orders o where o.id = p.order_id and o.status in ('confirmado', 'em_andamento', 'concluido')) then
    raise exception 'Esta proposta já foi paga. Cancele pelo pedido.';
  end if;
  update public.schedule_proposals set status = 'cancelada' where id = p.id;
  return true;
end $$;

revoke all on function public.cancel_proposal(uuid) from public, anon;

grant execute on function public.cancel_proposal(uuid) to authenticated;

-- ============ 11) Exclusão de conta: propostas saem junto (cascata nas FKs). Nada mais a fazer aqui.

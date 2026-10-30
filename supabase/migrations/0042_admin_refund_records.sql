-- Registros do ritual (fotos) para a administração decidir um reembolso em aberto.
-- Só a administração, só pedido em aberto de uma vaga de ritual; a consulta fica registrada. Rode no SQL Editor. É seguro repetir.
create or replace function public.admin_refund_records(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rr public.refund_requests%rowtype;
  ev uuid;
  recs jsonb;
begin
  if not public.is_admin() then raise exception 'Somente a administração.'; end if;
  select * into rr from public.refund_requests where id = p_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if rr.status not in ('pendente', 'aprovado') then raise exception 'Os registros só ficam disponíveis enquanto o pedido está em aberto.'; end if;
  select r.event_id into ev from public.reservations r where r.id = rr.reservation_id;
  if ev is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', er.kind, 'caption', er.caption, 'path', er.path, 'secret', er.secret, 'at', er.created_at
         ) order by er.created_at), '[]'::jsonb)
    into recs
    from public.event_records er
   where er.event_id = ev and er.expires_at > now();

  insert into public.admin_case_access (admin_id, refund_id) values (auth.uid(), p_id);
  return recs;
end;
$$;
revoke all on function public.admin_refund_records(uuid) from public, anon;
grant execute on function public.admin_refund_records(uuid) to authenticated;

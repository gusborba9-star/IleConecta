-- PASSO 277: 0128_arrependimento_vaga_extra — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) recusado pelo provedor, pendentes sem resposta e a tela da casa
create or replace function public.platform_seat_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.platform_seat_refunds; v_owner uuid;
begin
select * into r from public.platform_seat_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
update public.platform_seat_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso da vaga agora. A vaga continua com você. Tente de novo em instantes ou fale com o suporte.', '/equipe');
end if;
end $$;

create or replace function public.platform_seat_refunds_pending(p_older interval default interval '2 minutes')
returns table (refund_id uuid, provider text, ref text, amount_cents bigint)
language sql stable security definer set search_path = public as $$
select r.id, r.provider, c.paid_ref, r.amount_cents from public.platform_seat_refunds r join public.platform_charges c on c.id = r.charge_id
where r.status = 'pendente' and r.created_at < now() - p_older order by r.created_at limit 20;
$$;

create or replace function public.my_seat_refunds() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'window_days', 7, 'items', '[]'::jsonb, 'history', '[]'::jsonb); end if;
return jsonb_build_object('has_house', true, 'window_days', 7,
'items', coalesce((select jsonb_agg(jsonb_build_object('charge_id', c.id, 'amount_cents', c.paid_amount_cents, 'deadline', c.paid_at + interval '7 days') order by c.paid_at)
from public.platform_charges c where c.house_id = h and c.kind = 'extra_seat' and c.idempotency_key like 'upgrade:seat:%' and c.status = 'paga'
and c.paid_at + interval '7 days' >= now() and c.paid_ref is not null and c.paid_amount_cents > 0
and not exists (select 1 from public.platform_seat_refunds r where r.charge_id = c.id and r.status in ('pendente', 'concluido'))), '[]'::jsonb),
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_seat_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

-- ============ 6) permissões
revoke all on public.platform_seat_refunds from anon, authenticated;

grant select on public.platform_seat_refunds to authenticated;

revoke all on function public.platform_seat_refunds_guard(), public.platform_seat_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_seat_refund_done(uuid, text, timestamptz),
public.platform_seat_refund_fail(uuid, text), public.platform_seat_refunds_pending(interval), public.my_seat_refunds(), public.platform_seat_refunded_flag(), public.my_seat_release_schedule(int) from public, anon, authenticated;

grant execute on function public.platform_seat_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_seat_refund_done(uuid, text, timestamptz),
public.platform_seat_refund_fail(uuid, text), public.platform_seat_refunds_pending(interval) to service_role;

grant execute on function public.my_seat_refunds(), public.my_seat_release_schedule(int) to authenticated, service_role;

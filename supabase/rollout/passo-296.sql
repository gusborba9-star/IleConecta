-- PASSO 296: 0136_linha_do_tempo_da_casa_admin — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0136 — Linha do tempo da casa para a administração (Fase 5). SÓ LEITURA, sem tabela nova.
-- Blueprint §14: a timeline referencia os eventos originais, não duplica registros. Lê as tabelas originais na hora.
-- Só administração (is_admin). Nunca devolve texto de mensagem, dado de cliente (nome, CPF, e-mail) nem prova: só fatos da casa com a plataforma.
-- Cada abertura (primeira página) fica registrada em admin_audit, como as outras consultas da administração a uma casa.
-- Também devolve o que a casa tem a pagar à plataforma (com o desconto do Pix só se ainda estiver valendo).

create or replace function public.admin_house_timeline(p_house uuid, p_limit integer default 60, p_before timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 60), 1), 200);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_house public.houses%rowtype; v_to_pay jsonb; v_events jsonb; v_has_more boolean; v_next timestamptz;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_house is null then raise exception 'casa_inexistente' using errcode = 'P0002'; end if;
  select * into v_house from public.houses h where h.id = p_house;
  if not found then raise exception 'casa_inexistente' using errcode = 'P0002'; end if;

  if p_before is null then
    insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'ver_linha_do_tempo_da_casa', null, jsonb_build_object('house_id', p_house));
  end if;

  select jsonb_build_object(
      'total_cents', coalesce(sum(c.amount_cents), 0), 'count', count(*),
      'charges', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'description', c.description, 'amount_cents', c.amount_cents,
          'due_date', c.due_date, 'status', c.status,
          'pix_discount_cents', case when c.pix_discount_until is not null and c.pix_discount_until >= v_today then coalesce(c.pix_discount_cents, 0) else 0 end,
          'pix_discount_until', case when c.pix_discount_until is not null and c.pix_discount_until >= v_today then c.pix_discount_until end,
          'overdue', c.due_date < v_today) order by c.due_date, c.created_at), '[]'::jsonb))
    into v_to_pay from public.platform_charges c where c.house_id = p_house and c.status in ('aberta', 'vencida');

  with ev as (
    select v_house.created_at at, 'casa_criada'::text kind, v_house.id ref_id, 'Casa criada'::text title, null::text detail, null::bigint amount_cents, null::text status
    union all
    select h.created_at, 'plano', h.id, 'Plano: ' || coalesce(h.from_plan, '—') || ' → ' || h.to_plan, h.reason, null, null
      from public.house_plan_history h where h.house_id = p_house and h.reason <> 'inicio'
    union all
    select c.created_at, 'fatura_emitida', c.id, left(coalesce(c.description, c.kind), 100), c.kind, c.amount_cents, c.status
      from public.platform_charges c where c.house_id = p_house
    union all
    select c.paid_at, 'fatura_paga', c.id, left(coalesce(c.description, c.kind), 100), c.provider_method, coalesce(c.paid_amount_cents, c.amount_cents), c.status
      from public.platform_charges c where c.house_id = p_house and c.paid_at is not null
    union all
    select x.created_at, 'reembolso_plataforma', x.id, 'Reembolso de ' || x.rk, x.rk, x.amount_cents, x.status
      from (
        select id, created_at, amount_cents, status, 'plano' rk from public.platform_plan_refunds where house_id = p_house
        union all select id, created_at, amount_cents, status, 'vaga' from public.platform_seat_refunds where house_id = p_house
        union all select id, created_at, amount_cents, status, 'créditos' from public.platform_credit_refunds where house_id = p_house
        union all select id, created_at, amount_cents, status, 'destaque' from public.promo_refunds where house_id = p_house
      ) x
    union all
    select q.created_at, 'reembolso_cliente', q.id, 'Pedido de reembolso de cliente', q.kind, q.amount_cents, q.status
      from public.refund_requests q where q.house_id = p_house
    union all
    select f.created_at, 'moderacao', f.id, left(coalesce(f.excerpt, 'Conteúdo sinalizado'), 100), f.reason, null, f.status
      from public.moderation_flags f where f.house_id = p_house
    union all
    select f.contested_at, 'moderacao_contestada', f.id, 'Casa contestou a moderação', f.reason, null, f.status
      from public.moderation_flags f where f.house_id = p_house and f.contested_at is not null
    union all
    select s.created_at, 'suporte', s.id, left(s.title, 100), s.kind, null, s.status
      from public.support_cases s where s.house_id = p_house
    union all
    select r.reported_at, 'avaliacao_denunciada', r.id, 'Avaliação de ' || r.rating || ' estrela' || case when r.rating = 1 then '' else 's' end || ' denunciada', left(r.report_reason, 100), null,
           case when coalesce(r.hidden, false) then 'oculta' else 'visivel' end
      from public.reviews r where r.house_id = p_house and r.reported_at is not null
  ), ranked as (
    select e.*, row_number() over (order by e.at desc, e.ref_id, e.kind) rn from ev e where e.at is not null and (p_before is null or e.at < p_before)
  ), cut as (
    -- a página termina no instante do último item; quem tem o MESMO instante entra junto, para a próxima página nunca perder item
    select (select r.at from ranked r where r.rn = v_lim) c
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', r.at, 'kind', r.kind, 'ref_id', r.ref_id, 'title', r.title, 'detail', r.detail, 'amount_cents', r.amount_cents, 'status', r.status)
                      order by r.rn) filter (where cut.c is null or r.at >= cut.c), '[]'::jsonb),
         coalesce(bool_or(cut.c is not null and r.at < cut.c), false),
         max(cut.c)
    into v_events, v_has_more, v_next
    from ranked r cross join cut;

  return jsonb_build_object(
    'house', jsonb_build_object('id', v_house.id, 'name', v_house.name, 'plan', v_house.plan::text, 'created_at', v_house.created_at),
    'to_pay', v_to_pay, 'events', v_events, 'has_more', coalesce(v_has_more, false), 'next_before', case when coalesce(v_has_more, false) then v_next end,
    'scope', 'Só fatos da casa com a plataforma, lidos das tabelas originais na hora. Sem texto de conversa nem dados de clientes.');
end $$;

revoke all on function public.admin_house_timeline(uuid, integer, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_house_timeline(uuid, integer, timestamptz) to authenticated;

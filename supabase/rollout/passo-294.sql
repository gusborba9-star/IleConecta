-- PASSO 294: 0135_central_da_casa_pessoa_exata — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0135 — Central de pendências da casa: devolve o id da PESSOA nas conversas (para abrir a conversa exata). SÓ LEITURA.
-- Mesma função da 0130, com uma única mudança: o campo person_id nos itens de conversa (só para a titular).
-- Mesmos acessos da 0130: apenas usuários autenticados; nada guardado.

create or replace function public.house_pending_center()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_house uuid; v_owner uuid; v_name text; v_plan text; v_titular boolean := false; v_perms text[] := '{}';
  v_chat boolean; v_orders boolean; v_members boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_assist boolean := false; v_remaining int; v_limit int; v_used int; v_balance int;
  v_to_pay jsonb := null; v_level text := null; res jsonb;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select h.id, h.owner_id, h.name, h.plan::text into v_house, v_owner, v_name, v_plan from public.houses h where h.owner_id = v_uid order by h.created_at limit 1;
  if v_house is not null then v_titular := true;
  else
    select s.house_id, s.perms into v_house, v_perms from public.staff_row() s limit 1;
    if v_house is null then raise exception 'not_house' using errcode = '42501'; end if;
    select h.owner_id, h.name, h.plan::text into v_owner, v_name, v_plan from public.houses h where h.id = v_house;
  end if;
  v_chat := v_titular or 'chat_read' = any (v_perms) or 'chat_reply' = any (v_perms);
  v_orders := v_titular or 'orders' = any (v_perms);
  v_members := public.plan_cap_bool(v_plan, 'members_area') and (v_titular or 'members' = any (v_perms));

  if v_titular then
    -- assistente: só entra se está ligada. Resposta do plano do mês + créditos comprados (vale no Grátis também).
    select a.enabled into v_assist from public.assistants a where a.house_id = v_house;
    v_assist := coalesce(v_assist, false);
    if v_assist then
      v_limit := public.assistant_monthly_limit(v_plan);
      select count(*) into v_used from public.assistant_usage u where u.house_id = v_house and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
      v_balance := public.ai_credit_balance(v_house);
      v_remaining := greatest(coalesce(v_limit, 0) - v_used, 0) + coalesce(v_balance, 0);
    end if;
    -- o que a casa tem a pagar à plataforma (valores e vencimentos), para o CRM posicionar depois
    select jsonb_build_object(
        'total_cents', coalesce(sum(c.amount_cents), 0),
        'count', count(*),
        'charges', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'description', c.description, 'amount_cents', c.amount_cents,
            'due_date', c.due_date, 'status', c.status,
            'pix_discount_cents', case when c.pix_discount_until is not null and c.pix_discount_until >= v_today then coalesce(c.pix_discount_cents, 0) else 0 end,
            'overdue', c.due_date < v_today) order by c.due_date, c.created_at), '[]'::jsonb))
      into v_to_pay from public.platform_charges c where c.house_id = v_house and c.status in ('aberta', 'vencida');
  end if;

  with src as (
    -- conversas em que o cliente falou por último e ninguém (casa, equipe ou assistente) respondeu
    select 'conversa_sem_resposta'::text kind, x.cid ref_id, 'Conversa com ' || coalesce(nullif(p.display_name, ''), 'cliente') title, 'sem_resposta'::text detail,
           'normal'::text priority, x.last_at + make_interval(secs => public.house_pending_hours('conversa_sem_resposta') * 3600) due_at, x.last_at since, 'atendimento'::text tab
      from (
        select cm.conversation_id cid, o.user_id other_id, lm.sender_id, lm.created_at last_at
          from public.conversation_members cm
          join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id <> cm.user_id
          join lateral (select m.sender_id, m.created_at from public.messages m where m.conversation_id = cm.conversation_id and m.deleted_at is null order by m.created_at desc limit 1) lm on true
         where cm.user_id = v_owner
      ) x
      left join public.profiles p on p.id = x.other_id
     where v_chat and x.sender_id = x.other_id
       and x.last_at < now() - make_interval(secs => public.house_pending_hours('conversa_quieta') * 3600) and x.last_at > now() - interval '30 days'
       and not exists (select 1 from public.conversation_handoff h where h.conversation_id = x.cid and h.house_owner_id = v_owner and h.state = 'pendente')
       and not exists (select 1 from public.user_blocks b where (b.blocker_id = v_owner and b.blocked_id = x.other_id) or (b.blocker_id = x.other_id and b.blocked_id = v_owner))
    union all
    -- assunto delicado passado pela assistente para a equipe
    select 'assunto_da_assistente', h.conversation_id, 'Assunto para a casa: ' || left(coalesce(nullif(h.reason, ''), 'a assistente pediu ajuda'), 100), h.state, 'alta',
           h.since + make_interval(secs => public.house_pending_hours('assunto_da_assistente') * 3600), h.since, 'atendimento'
      from public.conversation_handoff h where v_chat and h.house_owner_id = v_owner and h.state = 'pendente'
    union all
    -- pedido pago esperando a casa iniciar (aparece 7 dias antes do horário marcado)
    select 'pedido_para_iniciar', o.id, left(o.title, 120), o.status, 'normal',
           coalesce(o.scheduled_at, o.updated_at + make_interval(secs => public.house_pending_hours('pedido_para_iniciar') * 3600)), o.updated_at, 'pedidos'
      from public.service_orders o
     where v_orders and o.house_id = v_house and o.status = 'confirmado'
       and coalesce(o.scheduled_at, o.updated_at + make_interval(secs => public.house_pending_hours('pedido_para_iniciar') * 3600)) < now() + interval '7 days'
    union all
    -- atendimento em andamento que passou do horário previsto
    select 'atendimento_passou', o.id, 'Passou do horário previsto: ' || left(o.title, 100), o.status, 'normal',
           o.ends_at + make_interval(secs => public.house_pending_hours('atendimento_passou') * 3600), o.ends_at, 'pedidos'
      from public.service_orders o where v_orders and o.house_id = v_house and o.status = 'em_andamento' and o.ends_at is not null and o.ends_at < now()
    union all
    -- mensalidade de membro vencida (só se a casa usa a área de membros)
    select 'mensalidade_vencida', d.id, 'Mensalidade de ' || coalesce(nullif(m.display_name, ''), 'membro') || ' — R$ ' || replace(to_char(d.amount_cents / 100.0, 'FM9999990.00'), '.', ','), d.status, 'normal',
           ((d.due_date + 1)::timestamp at time zone 'America/Sao_Paulo'), d.due_date::timestamptz, 'mensalidades'
      from public.member_dues d join public.house_members m on m.id = d.member_id
     where v_members and d.house_id = v_house and d.status = 'aberta' and d.due_date < v_today and m.left_at is null
    union all
    -- reembolso esperando a resposta da casa (só titular)
    select 'reembolso_da_casa', q.id, 'Reembolso de R$ ' || replace(to_char(q.amount_cents / 100.0, 'FM9999990.00'), '.', ','), q.status, 'alta',
           q.created_at + make_interval(secs => public.house_pending_hours('reembolso_da_casa') * 3600), q.created_at, 'pedidos'
      from public.refund_requests q where v_titular and q.house_id = v_house and q.status = 'pendente' and q.house_responded_at is null
    union all
    select 'avaliacao_sem_resposta', r.id, 'Avaliação de ' || r.rating || ' estrela' || case when r.rating = 1 then '' else 's' end || ' sem resposta', 'sem_resposta', 'normal',
           r.created_at + make_interval(secs => public.house_pending_hours('avaliacao_sem_resposta') * 3600), r.created_at, 'avaliacoes'
      from public.reviews r where v_titular and r.house_id = v_house and r.reply is null and not coalesce(r.hidden, false) and r.created_at > now() - interval '90 days'
    union all
    -- moderação: orientação ou advertência com prazo para a casa corrigir
    select 'moderacao', f.id, left(coalesce(f.excerpt, f.reason, 'Conteúdo sinalizado'), 120), f.status, 'alta', f.deadline_at, f.created_at, 'moderacao'
      from public.moderation_flags f where v_titular and f.house_id = v_house and f.status in ('orientada', 'advertida') and f.deadline_at is not null
    union all
    -- suporte: chamado esperando a resposta da casa
    select 'suporte', c.id, left(c.title, 120), c.status, 'normal', null::timestamptz, c.updated_at, 'suporte'
      from public.support_cases c
     where v_titular and ((c.status = 'aguardando_pessoa' and c.opened_by = v_owner)
        or (c.status = 'aguardando_envolvido' and exists (select 1 from public.support_case_parties sp where sp.case_id = c.id and sp.user_id = v_owner)))
    union all
    -- fatura da plataforma vencida ou a vencer em até 7 dias (todas as abertas ficam em "to_pay")
    select 'fatura', c.id, left(coalesce(c.description, 'Fatura da plataforma'), 100) || ' — R$ ' || replace(to_char(c.amount_cents / 100.0, 'FM9999990.00'), '.', ','), c.status,
           case when c.due_date < v_today then 'alta' else 'normal' end, ((c.due_date + 1)::timestamp at time zone 'America/Sao_Paulo'), c.created_at, 'cobranca'
      from public.platform_charges c
     where v_titular and c.house_id = v_house and c.status in ('aberta', 'vencida') and c.due_date <= v_today + 7
    union all
    -- cadastro: CPF/CNPJ do titular (obrigatório para quem assina plano pago)
    select 'cadastro_cpf_cnpj', v_house, 'Informe o CPF ou CNPJ do titular da casa', 'pendente', 'normal', null::timestamptz, null::timestamptz, 'cadastro'
     where v_titular and v_plan <> 'gratis' and not exists (select 1 from public.house_tax_ids t where t.house_id = v_house)
    union all
    select 'conta_de_recebimento', v_house, 'Conta de recebimento incompleta: faltam dados para receber pela plataforma', 'incompleta', 'alta', null::timestamptz, a.updated_at, 'cadastro'
      from public.house_payment_accounts a
     where v_titular and a.house_id = v_house and a.stripe_account_id is not null and (a.requirements_due is true or a.charges_enabled is not true or a.payouts_enabled is not true)
    union all
    select 'cartao_vencendo', v_house, 'O cartão salvo ' || case when make_date(k.exp_year, k.exp_month, 1) + interval '1 month' <= v_today then 'venceu' else 'vence em breve' end, 'cartao', 'alta',
           (make_date(k.exp_year, k.exp_month, 1) + interval '1 month')::timestamp at time zone 'America/Sao_Paulo', k.updated_at, 'cobranca'
      from public.house_card_on_file k
     where v_titular and k.house_id = v_house and k.auto_enabled and k.exp_year is not null and k.exp_month between 1 and 12
       and make_date(k.exp_year, k.exp_month, 1) + interval '1 month' <= v_today + 30
    union all
    -- assistente ligada e sem respostas (ou quase): vale para o Grátis com pacote de créditos também
    select 'assistente_sem_respostas', v_house, case when v_remaining <= 0 then 'A assistente está sem respostas disponíveis' else 'A assistente está quase sem respostas (' || v_remaining || ')' end,
           'creditos', case when v_remaining <= 0 then 'alta' else 'normal' end, null::timestamptz, null::timestamptz, 'assistente'
     where v_titular and v_assist and v_remaining <= 10
  ), ranked as (
    select s.*, (s.due_at is not null and s.due_at < now()) overdue from src s
  )
  select jsonb_build_object(
    'generated_at', now(),
    'house_id', v_house, 'house_name', v_name, 'role', case when v_titular then 'titular' else 'equipe' end,
    'total', (select count(*) from ranked),
    'overdue', (select count(*) from ranked where overdue),
    'counts', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from ranked group by kind) c),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'ref_id', r.ref_id, 'title', r.title, 'detail', r.detail, 'priority', r.priority,
        'due_at', r.due_at, 'overdue', r.overdue, 'since', r.since, 'tab', r.tab,
        -- quem é a pessoa da conversa (só para a titular; a equipe abre a conversa pelo id dela)
        'person_id', case when v_titular and r.kind in ('conversa_sem_resposta', 'assunto_da_assistente')
                          then (select cm.user_id from public.conversation_members cm where cm.conversation_id = r.ref_id and cm.user_id <> v_owner order by cm.user_id limit 1) end)
        order by r.overdue desc, case r.priority when 'alta' then 0 else 1 end, r.due_at nulls last, r.since nulls last), '[]'::jsonb)
      from (select * from ranked order by overdue desc, case priority when 'alta' then 0 else 1 end, due_at nulls last, since nulls last limit 200) r),
    'to_pay', v_to_pay,
    'scope', 'Só da sua casa. Lê as tabelas originais na hora; não guarda cópia. Mostra até 200 itens, os mais urgentes primeiro.')
  into res;
  return res;
end $$;

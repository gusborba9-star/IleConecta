-- 0111 — Plano Grátis (decisões do proprietário, 14/11/2026). Precisa da 0110 já aplicada (valor `gratis` do tipo house_plan).
-- 1) Quatro planos: Grátis (gratis), Essencial (base, pago), Profissional (intermediario) e Premium (maximo). Toda casa nova nasce no Grátis.
-- 2) Matriz com 4 planos e 3 limites novos (0 = sem limite): serviços ativos, rituais ativos e publicações por mês. Assistente: 100 / 500 / 1.700 respostas.
-- 3) Cancelar a assinatura, concluir o reembolso dos 7 dias ou descer de plano na renovação devolve a casa ao Grátis (antes ela ficava inativa). Falta de pagamento continua bloqueando.
-- 4) Contratar o Essencial; descer para Essencial ou Grátis na renovação.
-- 5) Limites do Grátis valem no servidor, e o Grátis só publica serviço (ou ritual com preço) depois de conectar a conta de pagamento.
-- 6) A assistente funciona no Grátis só com pacote de respostas; o pacote pode ser comprado por qualquer casa.
-- Estado de produção antes desta migration: 3 casas; nenhuma com cancelamento ativo; nenhuma conta inativa.

-- ============ 1) casa nova nasce no Grátis; casas sem assinatura que estavam em `base` passam para `gratis` ============
alter table public.houses alter column plan set default 'gratis';

create or replace function public.protect_house_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and coalesce(current_setting('app.admin_plan', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.verified := false; new.plan := 'gratis'; new.plan_revert_to := null; new.plan_revert_at := null;
    else
      new.verified := old.verified; new.plan := old.plan;
      new.plan_revert_to := old.plan_revert_to; new.plan_revert_at := old.plan_revert_at;
    end if;
  end if;
  return new;
end $$;

do $$
begin
  perform set_config('app.admin_plan', 'on', true);
  update public.houses h set plan = 'gratis', plan_revert_to = null, plan_revert_at = null
  where h.plan = 'base' and not exists (select 1 from public.house_billing_plan b where b.house_id = h.id and b.active);
  update public.houses set plan_revert_to = 'gratis' where plan_revert_to = 'base';
  perform set_config('app.admin_plan', 'off', true);
end $$;

-- ============ 2) ordem dos planos e matriz ============
create or replace function public.platform_plan_rank(p text) returns int
language sql immutable set search_path = public as $$
select case p when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 end;
$$;

create or replace function public.plan_matrix_default() returns jsonb
language sql immutable set search_path = public as $$
  select '{"caps":{"gratis":{"assistant_replies":0,"campaign_links":0,"campaign_card_styles":0,"quick_replies":0,"included_seats":0,"limit_services":3,"limit_rituals":2,"limit_posts_month":8,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"base":{"assistant_replies":100,"campaign_links":0,"campaign_card_styles":0,"quick_replies":3,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"intermediario":{"assistant_replies":500,"campaign_links":2,"campaign_card_styles":1,"quick_replies":10,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"maximo":{"assistant_replies":1700,"campaign_links":30,"campaign_card_styles":3,"quick_replies":50,"included_seats":1,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true}},"copy":{"gratis":{"tagline":"Comece a receber pessoas, sem mensalidade.","benefits":[{"text":"Página da casa, feed e avaliações dos clientes","feature":null},{"text":"Até {limit_services} serviços e {limit_rituals} rituais ativos, sempre com o pagamento da plataforma","feature":null},{"text":"Até {limit_posts_month} publicações por mês","feature":null},{"text":"Chat em texto","feature":null},{"text":"Assistente com pacote avulso de respostas, sem assinar nada","feature":null},{"text":"Impulsionamento e destaque quando quiser, pagando por dia","feature":null}]},"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Tudo do Grátis, sem limite de serviços, rituais e publicações","feature":null},{"text":"A assistente atende e vende (até {assistant_replies} respostas por mês)","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"Você escolhe vender pela plataforma ou combinar direto com o cliente","feature":null},{"text":"Datas públicas na agenda da casa","feature":null}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"}]}}}'::jsonb;
$$;

create or replace function public.plan_matrix_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text;
  nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20],"limit_services":[0,1000],"limit_rituals":[0,1000],"limit_posts_month":[0,1000]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 16 then return false; end if;
    for k in select jsonb_object_keys(nums) loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'number' then return false; end if;
      if (v ->> k) !~ '^[0-9]{1,6}$' then return false; end if;
      if (v ->> k)::int < (nums -> k ->> 0)::int or (v ->> k)::int > (nums -> k ->> 1)::int then return false; end if;
    end loop;
    foreach k in array flags loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'boolean' then return false; end if;
    end loop;
    v := m -> 'copy' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if coalesce(jsonb_typeof(v -> 'tagline'), '') <> 'string' then return false; end if;
    if char_length(btrim(v ->> 'tagline')) not between 1 and 120 then return false; end if;
    if coalesce(jsonb_typeof(v -> 'benefits'), '') <> 'array' then return false; end if;
    if jsonb_array_length(v -> 'benefits') > 12 then return false; end if;
    for b in select jsonb_array_elements(v -> 'benefits') loop
      if coalesce(jsonb_typeof(b), '') <> 'object' then return false; end if;
      if coalesce(jsonb_typeof(b -> 'text'), '') <> 'string' then return false; end if;
      if char_length(btrim(b ->> 'text')) not between 1 and 200 then return false; end if;
      t := coalesce(jsonb_typeof(b -> 'feature'), 'null');
      if t = 'string' then
        if not ((b ->> 'feature') = any (feats)) then return false; end if;
      elsif t <> 'null' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- A matriz salva (ainda com 3 planos) deixou de ser válida: passa a valer a nova, aprovada pelo proprietário em 14/11/2026.
update public.platform_settings set value = public.plan_matrix_default(), updated_at = now() where key = 'plan_matrix';

-- ============ 3) volta ao Grátis (cancelamento, reembolso dos 7 dias, descida na renovação) ============
create or replace function public.platform_house_to_free(p_house uuid, p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.admin_plan', 'on', true);
  update public.houses set plan = 'gratis', plan_revert_to = null, plan_revert_at = null where id = p_house and plan <> 'gratis';
  perform set_config('app.admin_plan', 'off', true);
  update public.house_billing_plan set active = false, pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = p_house and (active or pending_plan is not null);
  update public.house_billing_state set cancelled_at = null, cancel_at = null, cancel_charges = '{}', updated_at = now() where house_id = p_house;
  update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = p_house and auto_enabled;
end $$;

create or replace function public.platform_house_cancel_apply(p_house uuid, p_now timestamptz default now()) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_debt bigint; v_text text;
begin
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return false; end if;
v_debt := public.platform_house_overdue_cents(p_house, v_day);
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind in ('plan', 'extra_seat') and status = 'aberta' and due_date >= v_day;
perform public.platform_house_to_free(p_house, p_now);
perform public.platform_house_billing_recompute(p_house, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_cancelada', 'processado', p_house::text);
select owner_id into v_owner from public.houses where id = p_house;
if v_owner is not null then
v_text := 'Assinatura cancelada. Sua casa voltou ao plano Grátis e nenhuma nova cobrança será feita. Seus dados ficam guardados.';
if v_debt > 0 then
v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto e precisa ser paga.';
else
v_text := v_text || ' Para voltar a um plano pago, escolha em Planos.';
end if;
insert into public.notifications (user_id, text, href) values (v_owner, v_text, '/planos');
end if;
return true;
end $$;

create or replace function public.platform_plan_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.platform_plan_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.platform_plan_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.platform_plan_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
update public.platform_charges set status = 'cancelada' where house_id = r.house_id and kind in ('plan', 'extra_seat') and status in ('aberta', 'vencida');
perform public.platform_house_to_free(r.house_id, p_now);
perform public.platform_house_billing_recompute(r.house_id, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'plano_reembolsado', 'processado', r.house_id::text);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: a assinatura do plano foi cancelada, as cobranças mensais pararam e sua casa voltou ao plano Grátis. O dinheiro volta pelo mesmo meio de pagamento em alguns dias. Seus dados ficam guardados.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

-- o aviso do cancelamento agendado passa a dizer que a casa volta ao Grátis
create or replace function public.my_cancel_subscription(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text; v_next date; v_ids uuid[]; v_text text; v_debt bigint;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
if p_mode is null or p_mode not in ('agora', 'vencimento') then raise exception 'Escolha como quer cancelar.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa pode cancelar a assinatura.'; end if;
perform 1 from public.house_billing_plan where house_id = h and active for update;
select * into st from public.house_billing_state where house_id = h for update;
if found and st.cancel_at is not null and st.cancelled_at is null then raise exception 'O cancelamento já está agendado para %.', to_char(st.cancel_at, 'DD/MM/YYYY'); end if;
v_reason := public.platform_cancel_block_reason(h, d);
if v_reason is not null then raise exception '%', v_reason; end if;
v_debt := public.platform_house_overdue_cents(h, d);
v_next := public.platform_house_next_renewal(h, d);
if p_mode = 'agora' or v_next is null or v_next <= d then
perform public.platform_house_cancel_apply(h);
return jsonb_build_object('mode', 'agora', 'cancel_at', null, 'debt_cents', v_debt);
end if;
with u as (update public.platform_charges set status = 'cancelada' where house_id = h and kind in ('plan', 'extra_seat') and status = 'aberta' and due_date >= d returning id)
select coalesce(array_agg(id), '{}') into v_ids from u;
insert into public.house_billing_state (house_id, cancel_at, cancel_requested_at, cancel_charges, updated_at) values (h, v_next, now(), v_ids, now())
on conflict (house_id) do update set cancel_at = excluded.cancel_at, cancel_requested_at = excluded.cancel_requested_at, cancel_charges = excluded.cancel_charges, updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'cancelamento_agendado', 'processado', h::text || ':' || v_next);
v_text := 'Cancelamento agendado: você usa a plataforma até ' || to_char(v_next, 'DD/MM/YYYY') || '. Nesse dia a casa volta ao plano Grátis e nenhuma nova cobrança é feita. Até lá, você pode desfazer em Planos.';
if v_debt > 0 then v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto.'; end if;
insert into public.notifications (user_id, text, href) values (me, v_text, '/planos');
return jsonb_build_object('mode', 'vencimento', 'cancel_at', v_next, 'debt_cents', v_debt);
end $$;

-- ============ 4) troca de plano: contratar o Essencial; descer para o Essencial ou para o Grátis na renovação ============
alter table public.house_billing_plan drop constraint if exists house_billing_plan_pending_ck;

alter table public.house_billing_plan add constraint house_billing_plan_pending_ck check ((pending_plan is null) = (pending_plan_on is null) and (pending_plan is null or pending_plan in ('gratis', 'base', 'intermediario')));

create or replace function public.platform_subscribe_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_amt bigint; v_open uuid; v_n int; v_id uuid;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then raise exception 'A cobrança da plataforma ainda não está ativa.'; end if;
perform 1 from public.houses where id = p_house for update;
if not found then raise exception 'Casa inexistente.'; end if;
if p_plan is null or p_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Escolha um plano com mensalidade.'; end if;
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then raise exception 'A assinatura está cancelada. Use a reativação da casa.'; end if;
if exists (select 1 from public.house_billing_plan where house_id = p_house and active) then raise exception 'A casa já tem assinatura ativa. Use a troca de plano.'; end if;
v_amt := public.platform_plan_monthly_cents(p_plan, v_day);
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade na tabela. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida') and amount_cents = v_amt and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
if exists (select 1 from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status = 'em_processamento') then raise exception 'Há um pagamento em processamento. Aguarde a confirmação.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, v_amt, v_day, null, 'Assinatura do plano', 'assinatura:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_house_subscribed_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date := (coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo')::date; v_plan text := substring(new.item_key from 6); v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'assinatura:%' then return new; end if;
if v_plan not in ('base', 'intermediario', 'maximo') or exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) or exists (select 1 from public.house_billing_state where house_id = new.house_id and cancelled_at is not null) then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_paga_sem_efeito', new.id, 'rejeitado', new.house_id::text);
return new;
end if;
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = v_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = new.house_id;
perform set_config('app.admin_plan', 'off', true);
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (new.house_id, least(extract(day from v_day)::int, 28), v_day, true)
on conflict (house_id) do update set active = true, billing_day = excluded.billing_day, started_on = excluded.started_on, pending_plan = null, pending_plan_on = null, updated_at = now();
perform public.platform_house_billing_recompute(new.house_id);
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_ativada', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: seu plano está ativo e a cobrança mensal passa a vencer neste mesmo dia. A cobrança automática no cartão fica desligada até você ligar em Planos.', '/planos');
end if;
return new;
end $$;

create or replace function public.platform_plan_pending_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0; v_owner uuid;
begin
for r in select house_id, pending_plan from public.house_billing_plan where active and pending_plan is not null and pending_plan_on <= d order by pending_plan_on loop
begin
if r.pending_plan = 'gratis' then
update public.platform_charges set status = 'cancelada' where house_id = r.house_id and kind in ('plan', 'extra_seat') and status = 'aberta';
perform public.platform_house_to_free(r.house_id, p_now);
else
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = r.pending_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = r.house_id;
perform set_config('app.admin_plan', 'off', true);
update public.house_billing_plan set pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = r.house_id;
end if;
perform public.platform_house_billing_recompute(r.house_id, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'plano_reduzido', 'processado', r.house_id::text || ':' || r.pending_plan);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, case when r.pending_plan = 'gratis' then 'Sua casa voltou ao plano Grátis, como você pediu. Nenhuma nova mensalidade será cobrada. Para voltar a um plano pago, escolha em Planos.' else 'Seu plano foi alterado na renovação, como você pediu.' end, '/planos');
end if;
n := n + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_reducao_plano', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

create or replace function public.my_plan_change_schedule(p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; bp public.house_billing_plan; v_reason text; c date;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then raise exception 'Só a casa pode trocar de plano.'; end if;
select * into bp from public.house_billing_plan where house_id = h.id and active for update;
v_reason := public.platform_plan_change_block_reason(h.id, d);
if v_reason is not null then raise exception '%', v_reason; end if;
if p_plan is null or p_plan not in ('gratis', 'base', 'intermediario') or public.platform_plan_rank(p_plan) >= public.platform_plan_rank(h.plan::text) then raise exception 'Escolha um plano abaixo do atual.'; end if;
c := date_trunc('month', d)::date + (bp.billing_day - 1);
if c <= d then c := (date_trunc('month', d) + interval '1 month')::date + (bp.billing_day - 1); end if;
if exists (select 1 from public.platform_charges where house_id = h.id and kind = 'plan' and idempotency_key = 'plan:' || h.id || ':' || c and status <> 'cancelada') then c := (c + interval '1 month')::date; end if;
update public.house_billing_plan set pending_plan = p_plan, pending_plan_on = c, updated_at = now() where house_id = h.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_plano_agendada', 'processado', h.id::text || ':' || p_plan || ':' || c);
insert into public.notifications (user_id, text, href) values (me, 'Troca de plano agendada: você mantém o plano atual até ' || to_char(c, 'DD/MM/YYYY') || ' e, nessa renovação, passa para o plano escolhido. Até lá, pode desfazer em Planos.', '/planos');
return jsonb_build_object('plan', p_plan, 'effective_on', c);
end $$;

-- ============ 5) limites do Grátis e conta de pagamento obrigatória para publicar ============
create or replace function public.house_payment_ready(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from public.house_payment_accounts a where a.house_id = p_house and a.charges_enabled);
$$;

create or replace function public.trg_services_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int;
begin
if auth.uid() is null or new.active is not true then return new; end if;
if tg_op = 'UPDATE' and old.active then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
v_lim := public.plan_cap_int(v_plan, 'limit_services');
if v_lim > 0 then
select count(*) into v_n from public.services where house_id = new.house_id and active and id <> new.id;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % serviços ativos do seu plano. Assine um plano para publicar mais.', v_lim; end if;
end if;
if v_plan = 'gratis' and coalesce(new.price_cents, 0) > 0 and not public.house_payment_ready(new.house_id) then
raise exception 'Para publicar serviços no plano Grátis, conecte primeiro a sua conta de recebimento (Painel da casa, em Recebimento pela plataforma). Os pagamentos dos serviços são feitos pela plataforma.';
end if;
return new;
end $$;

drop trigger if exists trg_services_plan_guard on public.services;

create trigger trg_services_plan_guard before insert or update of active on public.services
for each row execute function public.trg_services_plan_guard();

create or replace function public.trg_events_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int;
begin
if auth.uid() is null or new.status::text <> 'publicado' then return new; end if;
if tg_op = 'UPDATE' and old.status::text = 'publicado' then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
v_lim := public.plan_cap_int(v_plan, 'limit_rituals');
if v_lim > 0 then
select count(*) into v_n from public.events where house_id = new.house_id and status::text = 'publicado' and starts_at > now() and id <> new.id;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % rituais ativos do seu plano. Assine um plano para publicar mais.', v_lim; end if;
end if;
if v_plan = 'gratis' and coalesce(new.price_cents, 0) > 0 and not public.house_payment_ready(new.house_id) then
raise exception 'Para publicar rituais com valor no plano Grátis, conecte primeiro a sua conta de recebimento (Painel da casa, em Recebimento pela plataforma). Os pagamentos são feitos pela plataforma.';
end if;
return new;
end $$;

drop trigger if exists trg_events_plan_guard on public.events;

create trigger trg_events_plan_guard before insert or update of status on public.events
for each row execute function public.trg_events_plan_guard();

create or replace function public.trg_posts_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int; v_from timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
if auth.uid() is null or new.house_id is null then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
v_lim := public.plan_cap_int(v_plan, 'limit_posts_month');
if v_lim > 0 then
select count(*) into v_n from public.posts where house_id = new.house_id and created_at >= v_from;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % publicações por mês do seu plano. Assine um plano para publicar sem limite.', v_lim; end if;
end if;
return new;
end $$;

drop trigger if exists trg_posts_plan_guard on public.posts;

create trigger trg_posts_plan_guard before insert on public.posts
for each row execute function public.trg_posts_plan_guard();

-- ============ 6) assistente no Grátis: só com pacote de respostas ============
create or replace function public.assistant_display_name(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select nullif(btrim(a.display_name), '')
from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and (public.assistant_monthly_limit(h.plan::text) > 0 or public.ai_credit_balance(h.id) > 0);
$$;

create or replace function public.assistant_avatar_path(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select a.avatar_path from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and a.avatar_path is not null and (public.assistant_monthly_limit(h.plan::text) > 0 or public.ai_credit_balance(h.id) > 0);
$$;

create or replace function public.assistants_avatar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
if new.avatar_path is null then return new; end if;
if tg_op = 'UPDATE' and new.avatar_path is not distinct from old.avatar_path then return new; end if;
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is null or split_part(new.avatar_path, '/', 1) <> v_owner::text then raise exception 'A foto da assistente precisa ser da própria casa.'; end if;
return new;
end $$;

create or replace function public.assistant_record_usage(p_house uuid, p_user uuid, p_model text, p_prompt integer, p_completion integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_usage uuid; v_plan text; v_owner uuid; v_limit int; v_used int; v_pack public.ai_credit_packs; v_from boolean := false; v_left int; v_thr int;
v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
perform pg_advisory_xact_lock(hashtextextended('assistant_usage:' || p_house::text, 0));
select owner_id, plan::text into v_owner, v_plan from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
v_limit := public.assistant_monthly_limit(v_plan);
insert into public.assistant_usage (house_id, user_id, model, prompt_tokens, completion_tokens)
values (p_house, p_user, p_model, greatest(coalesce(p_prompt, 0), 0), greatest(coalesce(p_completion, 0), 0)) returning id into v_usage;
select count(*) into v_used from public.assistant_usage where house_id = p_house and created_at >= v_month;
if v_used > v_limit then
select * into v_pack from public.ai_credit_packs where house_id = p_house and remaining > 0 and expires_at > now() order by purchased_at, id limit 1 for update;
if found then
update public.ai_credit_packs set remaining = remaining - 1 where id = v_pack.id;
insert into public.ai_credit_ledger (house_id, pack_id, usage_id) values (p_house, v_pack.id, v_usage);
v_from := true;
end if;
end if;
v_left := public.ai_credit_balance(p_house);
if v_owner is not null and v_limit > 0 then
v_thr := ceil(v_limit * 0.8)::int;
if v_thr < v_limit and v_used = v_thr then
insert into public.notifications (user_id, text, href) values (v_owner, 'A assistente já usou 80% das respostas do mês (' || v_used || ' de ' || v_limit || ').', '/planos');
elsif v_used = v_limit then
insert into public.notifications (user_id, text, href) values (v_owner, case when v_left > 0
then 'A franquia de respostas do mês acabou. A assistente continua com os seus créditos (saldo de ' || v_left || ' respostas).'
else 'A franquia de respostas do mês acabou. A assistente pausa até o próximo mês, ou compre um pacote de créditos para continuar.' end, '/planos');
elsif v_from and v_left = 0 then
insert into public.notifications (user_id, text, href) values (v_owner, 'Seus créditos de respostas acabaram. A assistente pausa até o próximo mês, ou compre um novo pacote.', '/planos');
end if;
elsif v_owner is not null and v_from and v_left = 0 then
insert into public.notifications (user_id, text, href) values (v_owner, 'Seus créditos de respostas acabaram. A assistente pausa até você comprar um novo pacote ou assinar um plano com assistente.', '/planos');
end if;
return jsonb_build_object('usage_id', v_usage, 'used_month', v_used, 'limit', v_limit, 'from_credit', v_from, 'credits_left', v_left, 'uncovered', v_used > v_limit and not v_from);
end $$;

create or replace function public.my_ai_credit_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; pl text; lim int; used int; v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
select id, plan::text into h, pl from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
lim := public.assistant_monthly_limit(pl);
select count(*) into used from public.assistant_usage where house_id = h and created_at >= v_month;
return jsonb_build_object('has_house', true, 'limit', lim, 'used_month', used, 'balance', public.ai_credit_balance(h),
'packs', coalesce((select jsonb_agg(jsonb_build_object('size', p.size, 'remaining', p.remaining, 'expires_at', p.expires_at) order by p.purchased_at, p.id) from public.ai_credit_packs p where p.house_id = h and p.remaining > 0 and p.expires_at > now()), '[]'::jsonb),
'prices', public.platform_billing_prices() -> 'credit_pack', 'for_sale', coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false));
end $$;

create or replace function public.platform_credit_purchase(p_house uuid, p_pack text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_price bigint; v_id uuid; v_size int; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
if p_pack not in ('p80', 'p200', 'p500') then raise exception 'Pacote inválido.'; end if;
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
perform pg_advisory_xact_lock(hashtextextended('credit_purchase:' || p_house::text, 0));
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
if public.house_billing_level(p_house) <> 'ok' then raise exception 'Regularize a fatura em atraso para comprar créditos.'; end if;
v_price := (public.platform_billing_prices() -> 'credit_pack' ->> p_pack)::bigint;
v_size := (regexp_replace(p_pack, '^p', ''))::int;
select id into v_id from public.platform_charges where house_id = p_house and kind = 'credit_pack' and item_key = p_pack and amount_cents = v_price and status in ('aberta', 'vencida') and created_at > now() - interval '1 day' order by created_at desc limit 1;
if v_id is not null then return v_id; end if;
return public.platform_charge_issue(p_house, 'credit_pack', p_pack, v_price, v_today, null, 'Pacote de ' || v_size || ' respostas da assistente', 'credit:' || p_house || ':' || gen_random_uuid());
end $$;

-- ============ 7) permissões: só o servidor chama as funções internas ============
revoke all on function public.platform_house_to_free(uuid, timestamptz), public.house_payment_ready(uuid), public.trg_services_plan_guard(), public.trg_events_plan_guard(), public.trg_posts_plan_guard() from public, anon, authenticated;

grant execute on function public.platform_house_to_free(uuid, timestamptz), public.house_payment_ready(uuid) to service_role;

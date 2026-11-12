-- PASSO 52: 0079_ferramentas_de_conta — parte 2 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.admin_unsuspend_account(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
  delete from public.account_suspensions where user_id = p_user;
  if not found then raise exception 'Esta conta não está suspensa.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (null, auth.uid(), 'conta_reativada', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user));
  insert into public.notifications (user_id, text, href) values (p_user, 'Sua conta foi reativada.', '/');
end $$;

-- ============ 3) exportação dos próprios dados ============
alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  return jsonb_build_object(
    'gerado_em', now(),
    'perfil', (select to_jsonb(p) - 'id' from public.profiles p where p.id = me),
    'casas', coalesce((select jsonb_agg(jsonb_build_object('nome', h.name, 'categoria', h.category, 'plano', h.plan, 'criada_em', h.created_at)) from public.houses h where h.owner_id = me), '[]'::jsonb),
    'aceites', coalesce((select jsonb_agg(jsonb_build_object('documento', c.doc_key, 'versao', c.doc_version, 'em', c.accepted_at) order by c.accepted_at) from public.legal_consents c where c.user_id = me), '[]'::jsonb),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('ritual', e.title, 'status', r.status, 'respostas', r.answers, 'em', r.created_at) order by r.created_at) from public.reservations r join public.events e on e.id = r.event_id where r.user_id = me), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('servico', o.title, 'valor_centavos', o.price_cents, 'status', o.status, 'observacao', o.note, 'em', o.created_at) order by o.created_at) from public.service_orders o where o.client_id = me), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('valor_centavos', p.gross_cents, 'status', p.status, 'metodo', p.payment_method, 'em', p.created_at) order by p.created_at)
        from public.payments p left join public.reservations r on r.id = p.reservation_id left join public.service_orders o on o.id = p.order_id where coalesce(r.user_id, o.client_id) = me), '[]'::jsonb),
    'reembolsos', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.kind, 'status', f.status, 'valor_centavos', f.amount_cents, 'motivo', f.reason, 'em', f.created_at) order by f.created_at) from public.refund_requests f where f.client_id = me), '[]'::jsonb),
    'mensagens_enviadas', coalesce((select jsonb_agg(jsonb_build_object('texto', m.text, 'em', m.created_at) order by m.created_at) from public.messages m where m.sender_id = me and m.deleted_at is null and not m.from_assistant), '[]'::jsonb),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object('texto', c.text, 'em', c.created_at) order by c.created_at) from public.post_comments c where c.user_id = me), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('nota', r.rating, 'comentario', r.comment, 'em', r.created_at) order by r.created_at) from public.reviews r where r.author_id = me), '[]'::jsonb),
    'casas_que_segue', coalesce((select jsonb_agg(h.name) from public.follows f join public.houses h on h.id = f.house_id where f.follower_id = me), '[]'::jsonb),
    'chamados', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.kind, 'titulo', c.title, 'descricao', c.description, 'status', c.status, 'em', c.created_at) order by c.created_at) from public.support_cases c where c.opened_by = me), '[]'::jsonb));
end $$;

-- ============ 4) exclusão de conta ============
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','cancelada','executada','recusada')),
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null default (now() + interval '7 days'),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_at timestamptz,
  executed_at timestamptz
);

create unique index if not exists account_deletion_one_pending on public.account_deletion_requests (user_id) where status = 'pendente';

alter table public.account_deletion_requests enable row level security;

revoke all on public.account_deletion_requests from anon, authenticated;

-- O que ainda impede a exclusão (dinheiro, reembolso ou atendimento em andamento). Vazio = pode excluir.
create or replace function public.account_deletion_blockers(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b jsonb := '[]'::jsonb;
begin
  if exists (select 1 from public.admins where user_id = p_user) then b := b || '["Conta de administrador: peça a remoção do acesso de administrador primeiro."]'::jsonb; end if;
  if exists (select 1 from public.support_cases c where (c.opened_by = p_user or c.subject_user = p_user) and c.status not in ('resolvido','recusado') and c.kind not in ('exclusao_conta','exclusao_dados','lgpd_dados','duvida','sugestao','tecnico','conta_acesso')) then
    b := b || '["Há um chamado em análise envolvendo você. A exclusão só pode ocorrer depois da decisão."]'::jsonb;
  end if;
  if exists (select 1 from public.refund_requests f where f.client_id = p_user and f.status in ('pendente','aprovado')) then b := b || '["Há um pedido de reembolso seu em andamento."]'::jsonb; end if;
  if exists (select 1 from public.service_orders o where o.client_id = p_user and o.status in ('confirmado','em_andamento','reembolso_pendente')) then b := b || '["Há um serviço contratado em andamento."]'::jsonb; end if;
  if exists (select 1 from public.reservations r join public.events e on e.id = r.event_id where r.user_id = p_user and r.status in ('confirmada','reembolso_pendente') and e.starts_at > now() - interval '1 day') then b := b || '["Há uma reserva de ritual confirmada que ainda não aconteceu."]'::jsonb; end if;
  if exists (select 1 from public.payments p left join public.reservations r on r.id = p.reservation_id left join public.service_orders o on o.id = p.order_id
              where coalesce(r.user_id, o.client_id) = p_user and p.status = 'pendente' and (p.pix_expires_at is null or p.pix_expires_at > now())) then b := b || '["Há um pagamento seu em andamento."]'::jsonb; end if;
  if exists (select 1 from public.houses h where h.owner_id = p_user) then
    if exists (select 1 from public.service_orders o join public.houses h on h.id = o.house_id where h.owner_id = p_user and o.status in ('confirmado','em_andamento','reembolso_pendente')) then b := b || '["Sua casa tem serviços contratados em andamento."]'::jsonb; end if;
    if exists (select 1 from public.refund_requests f join public.houses h on h.id = f.house_id where h.owner_id = p_user and f.status in ('pendente','aprovado')) then b := b || '["Sua casa tem reembolsos em andamento."]'::jsonb; end if;
    if exists (select 1 from public.reservations r join public.events e on e.id = r.event_id join public.houses h on h.id = e.house_id
                where h.owner_id = p_user and r.status in ('confirmada','reembolso_pendente') and e.starts_at > now() - interval '1 day' and e.status <> 'cancelado') then b := b || '["Sua casa tem rituais com reservas confirmadas que ainda não aconteceram. Cancele-os (com reembolso) antes."]'::jsonb; end if;
  end if;
  return b;
end $$;

revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;

create or replace function public.my_account_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suspensa', public.is_suspended(auth.uid()),
    'exclusao', (select jsonb_build_object('id', d.id, 'executa_em', d.execute_after) from public.account_deletion_requests d where d.user_id = auth.uid() and d.status = 'pendente'),
    'impedimentos', public.account_deletion_blockers(auth.uid()));
$$;

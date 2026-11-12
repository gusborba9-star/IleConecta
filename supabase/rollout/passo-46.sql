-- PASSO 46: 0078_chamados_e_casos — parte 3 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2b) identidade retida de contas excluídas ============
-- Quando uma conta é excluída, o nome, o e-mail e o tipo da conta ficam guardados à parte, só para o administrador, por 5 anos,
-- para identificar com exatidão o autor de aceites e transações em caso de disputa, fraude ou obrigação legal.
-- Nada disso aparece para outras pessoas. Cada consulta fica no registro de suporte.
create table if not exists public.deleted_account_identity (
  user_id uuid primary key,
  account_type text,
  display_name text,
  email text,
  houses text[] not null default '{}',
  deleted_at timestamptz not null default now(),
  retain_until timestamptz not null default (now() + interval '5 years'),
  request_id uuid
);

alter table public.deleted_account_identity enable row level security;

revoke all on public.deleted_account_identity from anon, authenticated;

create or replace function public.admin_deleted_identity(p_user uuid, p_reason text, p_case uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.deleted_account_identity;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da consulta (mínimo de 10 caracteres).'; end if;
  select * into d from public.deleted_account_identity where user_id = p_user;
  if not found then raise exception 'Não há identidade retida para esta pessoa.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (p_case, auth.uid(), 'identidade_consultada', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user));
  return jsonb_build_object('usuario', d.user_id, 'tipo_conta', d.account_type, 'nome', d.display_name, 'email', d.email, 'casas', d.houses, 'excluida_em', d.deleted_at, 'guardada_ate', d.retain_until);
end $$;

-- Mensagem apagada continua no arquivo (só o administrador lê). Enquanto houver chamado aberto sobre a conversa, o arquivo fica retido por até 24 meses.
create or replace function public.hold_archive_for_open_case()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.support_cases c where c.conversation_id = new.conversation_id and c.status not in ('resolvido','recusado')) then
    new.purge_after := greatest(new.purge_after, now() + interval '24 months');
  end if;
  return new;
end $$;

drop trigger if exists trg_hold_archive on public.message_archive;

create trigger trg_hold_archive before insert on public.message_archive for each row execute function public.hold_archive_for_open_case();

-- ============ 3) fatos reais da plataforma ============
-- A pessoa é parte do contexto? (dono do pedido/reserva/pagamento/conversa/avaliação, ou a casa envolvida)
create or replace function public.support_context_parties(p_type text, p_id uuid)
returns table (client_id uuid, house_owner uuid, house_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_type = 'pedido' then
    return query select o.client_id, h.owner_id, h.id from public.service_orders o join public.houses h on h.id = o.house_id where o.id = p_id;
  elsif p_type = 'reserva' then
    return query select r.user_id, h.owner_id, h.id from public.reservations r join public.events e on e.id = r.event_id join public.houses h on h.id = e.house_id where r.id = p_id;
  elsif p_type = 'pagamento' then
    return query select coalesce(r.user_id, o.client_id), h.owner_id, h.id
      from public.payments p
      left join public.reservations r on r.id = p.reservation_id left join public.events e on e.id = r.event_id
      left join public.service_orders o on o.id = p.order_id
      join public.houses h on h.id = coalesce(e.house_id, o.house_id) where p.id = p_id;
  elsif p_type = 'reembolso' then
    return query select f.client_id, h.owner_id, h.id from public.refund_requests f join public.houses h on h.id = f.house_id where f.id = p_id;
  elsif p_type = 'avaliacao' then
    return query select rv.author_id, h.owner_id, h.id from public.reviews rv join public.houses h on h.id = rv.house_id where rv.id = p_id;
  elsif p_type = 'conversa' then
    return query select (select cm.user_id from public.conversation_members cm where cm.conversation_id = p_id and not exists (select 1 from public.houses hh where hh.owner_id = cm.user_id) limit 1),
                        (select h.owner_id from public.conversation_members cm join public.houses h on h.owner_id = cm.user_id where cm.conversation_id = p_id limit 1),
                        (select h.id from public.conversation_members cm join public.houses h on h.owner_id = cm.user_id where cm.conversation_id = p_id limit 1)
      where exists (select 1 from public.conversations c where c.id = p_id);
  end if;
end $$;

revoke all on function public.support_context_parties(text, uuid) from public, anon, authenticated;

-- Conversa entre as partes do contexto (ou a própria conversa).
create or replace function public.support_conversation_of(p_type text, p_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare pt record; cid uuid;
begin
  if p_type is null then return null; end if;
  if p_type = 'conversa' then return p_id; end if;
  select * into pt from public.support_context_parties(p_type, p_id);
  if not found then return null; end if;
  select cm1.conversation_id into cid from public.conversation_members cm1 join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
   where cm1.user_id = pt.client_id and cm2.user_id = pt.house_owner limit 1;
  return cid;
end $$;

revoke all on function public.support_conversation_of(text, uuid) from public, anon, authenticated;

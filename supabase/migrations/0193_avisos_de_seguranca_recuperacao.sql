-- 0193 — Os 3 avisos da recuperação de acesso passam pela mesma fila e pelos mesmos textos dos demais avisos de segurança
-- (frase "se foi você", botão "Não fui eu", sino no app). Só o servidor cria o evento.
alter table public.security_events drop constraint if exists security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check check (kind in
  ('login_novo_aparelho', 'conta_bloqueada', 'senha_alterada', 'palavra_alterada', 'recuperacao_pedida', 'recuperacao_aprovada', 'email_alterado'));

create or replace function public.sec_notice_text(p_kind text, p_detail jsonb) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'login_novo_aparelho' then 'Entrada em um aparelho novo (' || coalesce(p_detail->>'label', 'aparelho') || '). Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'conta_bloqueada' then 'Sua conta foi bloqueada por excesso de tentativas de senha. Se foi você, aguarde ou desbloqueie. Se não foi, toque aqui.'
    when 'senha_alterada' then 'Sua senha foi alterada. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'palavra_alterada' then 'Sua palavra de segurança foi alterada. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'recuperacao_pedida' then 'Alguém pediu para recuperar o acesso da sua conta. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'recuperacao_aprovada' then 'Um pedido de troca do e-mail da sua conta foi aprovado e aguarda confirmação. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    when 'email_alterado' then 'O e-mail da sua conta foi alterado. Se foi você, não precisa fazer nada. Se não foi, toque aqui.'
    else 'Aviso de segurança da sua conta.' end
$$;

create or replace function public.sec_event_push(p_user uuid, p_kind text, p_detail jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('recuperacao_pedida', 'recuperacao_aprovada', 'email_alterado') then raise exception 'Tipo inválido.'; end if;
  if not exists (select 1 from auth.users where id = p_user) then return null; end if;
  return public.sec_event_add(p_user, p_kind, p_detail);
end $$;
revoke all on function public.sec_event_push(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sec_event_push(uuid, text, jsonb) to service_role;

-- O aviso pode ir para um e-mail específico (o antigo, depois da troca); esse endereço nunca volta ao navegador.
create or replace function public.sec_due_events() returns table (id uuid, kind text, detail jsonb, created_at timestamptz, user_id uuid, email text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    with c as (
      update public.security_events e set mail_claim_at = now()
      where e.id in (select x.id from public.security_events x where x.mailed_at is null and x.created_at > now() - interval '2 days'
                       and (x.mail_claim_at is null or x.mail_claim_at < now() - interval '10 minutes') order by x.created_at limit 20 for update skip locked)
      returning e.id, e.kind, e.detail, e.created_at, e.user_id)
    select c.id, c.kind, c.detail, c.created_at, c.user_id, coalesce(nullif(c.detail->>'to', ''), u.email)::text from c join auth.users u on u.id = c.user_id;
end $$;

create or replace function public.my_security_events() returns table (id uuid, kind text, detail jsonb, created_at timestamptz, reported boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.kind, e.detail - 'to', e.created_at, exists (select 1 from public.security_reports r where r.event_id = e.id)
  from public.security_events e where e.user_id = auth.uid() order by e.created_at desc limit 30
$$;
revoke all on function public.sec_due_events() from public, anon, authenticated;
grant execute on function public.sec_due_events() to service_role;
revoke all on function public.my_security_events() from public, anon;
grant execute on function public.my_security_events() to authenticated;

-- Painel do dono: também não mostra o endereço guardado no detalhe.
create or replace function public.admin_security_reports(p_status text default 'aberto')
returns table (id uuid, created_at timestamptz, status text, source text, kind text, detail jsonb, event_at timestamptz, user_id uuid, display_name text, note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_can('dono') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query select r.id, r.created_at, r.status, r.source, e.kind, e.detail - 'to', e.created_at, r.user_id, p.display_name, r.note
    from public.security_reports r join public.security_events e on e.id = r.event_id left join public.profiles p on p.id = r.user_id
    where p_status is null or p_status = 'todos' or r.status = p_status order by r.created_at desc limit 200;
end $$;
revoke all on function public.admin_security_reports(text) from public, anon;
grant execute on function public.admin_security_reports(text) to authenticated;

-- PASSO 244: 0118_proposta_de_horario_pelo_chat — parte 2 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) Quem recebeu uma proposta aberta pode contratar mesmo serviço privado (não listado)
create or replace function public.service_offered_to_me(p_service uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
       where m.from_assistant and m.action ->> 'target' = 'service' and m.action ->> 'id' = p_service::text)
    or exists (
      select 1 from public.schedule_proposals sp
       where sp.service_id = p_service and sp.client_id = auth.uid() and sp.status = 'aberta' and sp.expires_at > now()));
$$;

revoke all on function public.service_offered_to_me(uuid) from public, anon, authenticated;

-- ============ 4) Serviço presencial sem agenda própria pode ser contratado quando a casa propõe o horário
do $$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.create_service_order(uuid, text)'::regprocedure);
  if position('app.booking' in substr(src, position('delivery = ''presencial''' in src), 120)) > 0 then return; end if;
  patched := replace(src, 'if svc.delivery = ''presencial'' and not svc.bookable then raise exception',
                          'if svc.delivery = ''presencial'' and not svc.bookable and coalesce(current_setting(''app.booking'', true), '''') <> ''1'' then raise exception');
  if patched = src then raise exception 'create_service_order: trecho presencial nao encontrado'; end if;
  execute patched;
end $$;

-- ============ 5) Conflito de agenda (interna): devolve o motivo ou null se o intervalo está livre
create or replace function public.schedule_conflict(p_house uuid, p_start timestamptz, p_end timestamptz, p_ignore_order uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.service_orders o
              where o.house_id = p_house and o.scheduled_at is not null and (p_ignore_order is null or o.id <> p_ignore_order)
                and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
                and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(p_start, p_end)) then
    return 'pedido';
  end if;
  if exists (select 1 from public.events ev
              where ev.house_id = p_house and ev.status = 'publicado' and ev.duration_min is not null
                and tstzrange(ev.starts_at, ev.starts_at + make_interval(mins => ev.duration_min)) && tstzrange(p_start, p_end)) then
    return 'ritual';
  end if;
  if exists (select 1 from public.house_blocks b
              where b.house_id = p_house and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end)) then
    return 'bloqueio';
  end if;
  if exists (select 1 from public.house_calendar_blocks(p_house, (p_start at time zone 'America/Sao_Paulo')::date, (p_end at time zone 'America/Sao_Paulo')::date) c
              where tstzrange(c.starts_at, c.ends_at) && tstzrange(p_start, p_end)) then
    return 'calendario';
  end if;
  return null;
end $$;

revoke all on function public.schedule_conflict(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.schedule_conflict_text(p_reason text)
returns text language sql immutable set search_path = public as $$
  select case p_reason
    when 'pedido' then 'Já existe um pedido neste horário.'
    when 'ritual' then 'Há um ritual publicado neste horário.'
    when 'bloqueio' then 'Este horário está bloqueado na sua agenda.'
    when 'calendario' then 'Há uma data do seu calendário neste horário.'
    else 'Este horário não está livre.' end;
$$;

revoke all on function public.schedule_conflict_text(text) from public, anon, authenticated;

create or replace function public.proposal_when_text(p_at timestamptz)
returns text language sql immutable set search_path = public as $$
  select (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[extract(dow from p_at at time zone 'America/Sao_Paulo')::int + 1]
         || ' ' || to_char(p_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
$$;

revoke all on function public.proposal_when_text(timestamptz) from public, anon, authenticated;

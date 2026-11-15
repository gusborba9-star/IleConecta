-- 0119 — Ritual não é publicado sobre um bloqueio manual da própria agenda da casa.
-- Antes, a publicação só recusava choque com atendimento já contratado; um bloqueio (folga, viagem, horário combinado fora)
-- era ignorado e o ritual ia ao ar por cima dele. Só vale ao publicar ou ao mudar horário/duração de um ritual publicado
-- (editar título, vagas ou valor de um ritual já publicado não é barrado).
create or replace function public.events_schedule_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status is distinct from 'publicado'
       or old.starts_at is distinct from new.starts_at or old.duration_min is distinct from new.duration_min) then
    if new.duration_min is null then raise exception 'Informe a duração do ritual.'; end if;
    -- a casa é a unidade de serialização: atendimentos e rituais não se sobrepõem por corrida
    perform 1 from public.houses where id = new.house_id for update;
    if exists (
      select 1 from public.service_orders o
       where o.house_id = new.house_id and o.scheduled_at is not null
         and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
         and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_min))
    ) then
      raise exception 'Já existe um atendimento marcado neste horário. Escolha outro horário para o ritual.';
    end if;
    if exists (
      select 1 from public.house_blocks b
       where b.house_id = new.house_id
         and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_min))
    ) then
      raise exception 'Este horário está bloqueado na sua agenda. Remova o bloqueio ou escolha outro horário para o ritual.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.events_schedule_guard() from public, anon, authenticated;

-- PASSO 14 de 18: 0067 d: duracao do ritual e gatilho
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ F7) duração do ritual ocupa a agenda ============
-- Duração prevista (minutos). Rituais publicados antes desta migration ficam sem duração e, por isso, não bloqueiam horários;
-- ao publicar, mudar a data ou a duração de um ritual, a duração passa a ser obrigatória.
alter table public.events add column if not exists duration_min smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_duration_min_check') then
    alter table public.events add constraint events_duration_min_check check (duration_min is null or duration_min between 15 and 1440);
  end if;
end $$;

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
  end if;
  return new;
end $$;
revoke all on function public.events_schedule_guard() from public, anon, authenticated;
drop trigger if exists trg_events_schedule on public.events;
create trigger trg_events_schedule before insert or update on public.events for each row execute function public.events_schedule_guard();

-- FIM DO PASSO 14

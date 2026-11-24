-- Vídeo, parecer jurídico (24/11/2026): (1) registro da ciência do aviso antes de entrar na sala; (2) retenção do agendamento:
-- reunião da casa sem vínculo financeiro: 12 meses; consulta ligada a pedido pago: 5 anos. A exclusão leva junto o consumo e as ciências (on delete cascade).
create table if not exists public.video_acks (
  meeting_id uuid not null references public.video_meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null check (char_length(version) <= 60),
  acked_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
alter table public.video_acks enable row level security;
revoke all on public.video_acks from public, anon, authenticated;

-- Só quem pode entrar na sala registra a ciência (a regra é a mesma da entrada: o banco decide).
create or replace function public.video_ack(p_meeting uuid, p_version text) returns void
language plpgsql security definer set search_path = public as $$
declare chk jsonb;
begin
  if auth.uid() is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  chk := public.video_join_check(p_meeting);
  if coalesce(chk ->> 'ok', 'false') <> 'true' then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  insert into public.video_acks (meeting_id, user_id, version) values (p_meeting, auth.uid(), left(coalesce(nullif(btrim(p_version), ''), 'sem-versao'), 60))
  on conflict (meeting_id, user_id) do update set version = excluded.version, acked_at = now();
end $$;
revoke execute on function public.video_ack(uuid, text) from public, anon;
grant execute on function public.video_ack(uuid, text) to authenticated;

select cron.schedule('purge-video-meetings', '17 4 * * *', $c$delete from public.video_meetings where (kind = 'reuniao' and starts_at < now() - interval '12 months') or (kind = 'consulta' and starts_at < now() - interval '5 years')$c$);

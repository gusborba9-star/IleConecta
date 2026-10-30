-- Vídeo curto (até 30 s) nos registros do ritual. Recurso DESLIGADO por padrão: só funciona quando o administrador
-- liga "Vídeo nos registros do ritual" em Funcionalidades (ligado ou beta) E a casa está no plano Premium.
-- Vídeo fica disponível por 7 dias (foto: 30). Limite: 3 vídeos por ritual. É seguro repetir.

alter table public.event_records add column if not exists media text not null default 'image' check (media in ('image', 'video'));

update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4']
 where id = 'ritual-records';

-- Interruptor + plano Premium ('maximo'), conferido no servidor.
create or replace function public.ritual_video_enabled(p_house uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f jsonb; st text; own uuid; pl text;
begin
  select value -> 'ritual_video' into f from public.platform_settings where key = 'features';
  st := coalesce(f ->> 'state', 'off');
  select owner_id, plan::text into own, pl from public.houses where id = p_house;
  if own is null or pl is distinct from 'maximo' then return false; end if;
  if st = 'on' then return true; end if;
  if st = 'beta' then return coalesce(f -> 'beta_houses', '[]'::jsonb) ? own::text; end if;
  return false;
end $$;

-- (A função antiga add_event_record, só de foto, continua existindo e não é mais usada pelo app.)
-- A casa pergunta se pode gravar vídeo neste ritual (a tela só mostra o botão se sim).
create or replace function public.can_record_video(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e
                  where e.id = p_event and public.is_house_owner(e.house_id) and public.ritual_video_enabled(e.house_id));
$$;

create or replace function public.add_ritual_record(p_event uuid, p_kind text, p_caption text, p_path text, p_size integer, p_secret boolean, p_media text default 'image')
returns integer language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  hname text;
  owner uuid;
  n integer;
begin
  select * into ev from public.events where id = p_event;
  if not found or not public.is_house_owner(ev.house_id) then raise exception 'Ritual não encontrado.'; end if;
  if ev.started_at is null then raise exception 'Inicie o ritual para publicar registros.'; end if;
  if ev.status not in ('publicado', 'encerrado') then raise exception 'Este ritual não está ativo.'; end if;
  if ev.finished_at is not null and ev.finished_at < now() - interval '7 days' then
    raise exception 'O prazo para publicar registros deste ritual terminou.';
  end if;
  if p_kind not in ('inicio', 'durante', 'fim') then raise exception 'Tipo de registro inválido.'; end if;
  if p_media not in ('image', 'video') then raise exception 'Tipo de arquivo inválido.'; end if;
  if p_path is null or p_path not like p_event::text || '/%' then raise exception 'Arquivo inválido.'; end if;
  if p_media = 'video' then
    if not public.ritual_video_enabled(ev.house_id) then raise exception 'Vídeo não está disponível para esta casa.'; end if;
    if p_path !~* '\.(webm|mp4)$' then raise exception 'Arquivo inválido.'; end if;
    if (select count(*) from public.event_records where event_id = p_event and media = 'video' and expires_at > now()) >= 3 then
      raise exception 'Limite de 3 vídeos por ritual. Apague algum para publicar outro.';
    end if;
  elsif p_path !~* '\.(jpg|jpeg|png|webp)$' then
    raise exception 'Arquivo inválido.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'ritual-records' and name = p_path) then
    raise exception 'O arquivo não foi enviado.';
  end if;
  if (select count(*) from public.event_records where event_id = p_event and expires_at > now()) >= 12 then
    raise exception 'Limite de 12 registros por ritual. Apague algum para publicar outro.';
  end if;

  insert into public.event_records (event_id, kind, caption, path, size_bytes, secret, media, expires_at)
  values (p_event, p_kind, nullif(trim(p_caption), ''), p_path, p_size, coalesce(p_secret, false), p_media,
          now() + case when p_media = 'video' then interval '7 days' else interval '30 days' end);

  select h.name, h.owner_id into hname, owner from public.houses h where h.id = ev.house_id;
  insert into public.notifications (user_id, text, href)
  select r.user_id,
         'Novo registro do ritual ' || ev.title || ': ' || hname || ' publicou ' || case when p_media = 'video' then 'um vídeo.' else 'uma foto.' end,
         '/casa/' || owner || '?aba=rituais'
    from public.reservations r
   where r.event_id = p_event and r.status = 'confirmada';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.add_ritual_record(uuid, text, text, text, integer, boolean, text) from public, anon;
grant execute on function public.add_ritual_record(uuid, text, text, text, integer, boolean, text) to authenticated;
revoke all on function public.ritual_video_enabled(uuid) from public, anon;
grant execute on function public.ritual_video_enabled(uuid) to authenticated;
revoke all on function public.can_record_video(uuid) from public, anon;
grant execute on function public.can_record_video(uuid) to authenticated;

-- Admin (reembolso): devolve também o tipo (foto ou vídeo).
create or replace function public.admin_refund_records(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rr public.refund_requests%rowtype; ev uuid; recs jsonb;
begin
  if not public.is_admin() then raise exception 'Somente a administração.'; end if;
  select * into rr from public.refund_requests where id = p_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if rr.status not in ('pendente', 'aprovado') then raise exception 'Os registros só ficam disponíveis enquanto o pedido está em aberto.'; end if;
  select r.event_id into ev from public.reservations r where r.id = rr.reservation_id;
  if ev is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', er.kind, 'caption', er.caption, 'path', er.path, 'secret', er.secret, 'at', er.created_at, 'media', er.media
         ) order by er.created_at), '[]'::jsonb)
    into recs from public.event_records er where er.event_id = ev and er.expires_at > now();
  insert into public.admin_case_access (admin_id, refund_id) values (auth.uid(), p_id);
  return recs;
end $$;

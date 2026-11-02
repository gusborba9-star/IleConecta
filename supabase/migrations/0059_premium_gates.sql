-- Premium: área de membros, calendário completo e fotos/vídeos no chat valem pelo plano da casa (houses.plan = 'maximo').
-- Texto e PDF continuam para todas as casas. Cortesia e teste pelo admin seguem valendo, pois mudam houses.plan.

create or replace function public.conversation_has_premium_house(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members cm
    join public.houses h on h.owner_id = cm.user_id
    where cm.conversation_id = c and h.plan = 'maximo'
  );
$$;

-- Área de membros: todas as funções da casa passam por member_my_house.
create or replace function public.member_my_house()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare h uuid; p public.house_plan;
begin
  select id, plan into h, p from public.houses where owner_id = auth.uid();
  if h is null then raise exception 'Somente a casa pode fazer isso.'; end if;
  if p <> 'maximo' then raise exception 'A área de membros faz parte do plano Premium.'; end if;
  return h;
end $$;

-- Chat: foto e vídeo só em conversas com casa Premium; vídeo até 25 MB.
alter table public.messages drop constraint if exists messages_attachment_check;
alter table public.messages add constraint messages_attachment_check check (
  attachment_path is null or (
    attachment_path like (conversation_id::text || '/%')
    and attachment_type = any (array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','video/quicktime'])
    and attachment_size is not null
    and attachment_size <= case when attachment_type like 'video/%' then 26214400 else 10485760 end
  )
);

create or replace function public.messages_media_needs_premium()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.attachment_type is not null and new.attachment_type <> 'application/pdf'
     and not public.conversation_has_premium_house(new.conversation_id) then
    raise exception 'Fotos e vídeos no chat fazem parte do plano Premium da casa.';
  end if;
  return new;
end $$;
drop trigger if exists trg_messages_media_premium on public.messages;
create trigger trg_messages_media_premium before insert on public.messages
  for each row execute function public.messages_media_needs_premium();

update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','video/quicktime']
  where id = 'chat-files';

drop policy if exists "chat-files: membros enviam" on storage.objects;
create policy "chat-files: membros enviam" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
    and (name ~* '\.pdf$' or public.conversation_has_premium_house(((storage.foldername(name))[1])::uuid))
  );

-- Calendário: fora do Premium, a data não repete todo ano e não tem público "seguidores".
create or replace function public.calendar_premium_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.house_plan;
begin
  select plan into p from public.houses where id = new.house_id;
  if p is distinct from 'maximo' then
    new.vis_followers := false;
    new.yearly := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_calendar_premium on public.house_calendar_items;
create trigger trg_calendar_premium before insert or update on public.house_calendar_items
  for each row execute function public.calendar_premium_limits();

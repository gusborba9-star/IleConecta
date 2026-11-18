-- PASSO 332: 0162_momentos_das_casas — parte 2 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) tabela de momentos (stories) ============
alter table public.stories alter column image_url drop not null;

alter table public.stories add column if not exists media_kind text not null default 'image';

alter table public.stories add column if not exists media_path text;

alter table public.stories add column if not exists poster_path text;

alter table public.stories add column if not exists duration_s smallint;

alter table public.stories add column if not exists link_kind text;

alter table public.stories add column if not exists link_id uuid;

alter table public.stories add column if not exists hidden_at timestamptz;

alter table public.stories add column if not exists purged_at timestamptz;

alter table public.stories drop constraint if exists stories_media_kind_ok;

alter table public.stories add constraint stories_media_kind_ok check (media_kind in ('image', 'video'));

alter table public.stories drop constraint if exists stories_caption_len;

alter table public.stories add constraint stories_caption_len check (caption is null or char_length(caption) <= 140);

alter table public.stories drop constraint if exists stories_duration_ok;

alter table public.stories add constraint stories_duration_ok check (duration_s is null or duration_s between 1 and 31);

alter table public.stories drop constraint if exists stories_link_ok;

alter table public.stories add constraint stories_link_ok check ((link_kind is null and link_id is null) or (link_kind in ('service', 'event') and link_id is not null));

create index if not exists stories_created on public.stories (house_id, created_at desc);

drop policy if exists stories_read on public.stories;

create policy stories_read on public.stories for select
  using ((expires_at > now() and hidden_at is null and purged_at is null) or public.is_house_owner(house_id));

-- Trava no banco: a foto/vídeo precisa ser da própria casa (bucket moments), o plano precisa permitir, o limite diário vale
-- (com trava por casa para dois envios ao mesmo tempo não passarem) e a validade é sempre 24 h, definida aqui (a tela não escolhe).
create or replace function public.stories_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text; v_cap int; v_n int; v_ext text; v_re text;
begin
  select h.owner_id, h.plan::text into v_owner, v_plan from public.houses h where h.id = new.house_id;
  if v_owner is null then raise exception 'Casa não encontrada.'; end if;
  v_cap := public.plan_cap_int(v_plan, 'moments_per_day');
  if v_cap <= 0 then raise exception 'Momentos estão disponíveis a partir do plano Essencial.'; end if;
  v_re := '^' || v_owner::text || '/[A-Za-z0-9._-]+\.';
  if new.media_path is null or new.media_path !~* (v_re || '(jpe?g|png|webp|mp4|webm|mov)$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = new.media_path) then
    raise exception 'O arquivo do momento precisa ser enviado pela própria plataforma.';
  end if;
  v_ext := lower(substring(new.media_path from '\.([A-Za-z0-9]+)$'));
  new.media_kind := case when v_ext in ('mp4', 'webm', 'mov') then 'video' else 'image' end;
  if new.media_kind = 'video' then
    if not public.plan_cap_bool(v_plan, 'moment_video') then raise exception 'Momentos em vídeo estão disponíveis no plano Premium.'; end if;
    if new.poster_path is null or new.poster_path !~* (v_re || '(jpe?g|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = new.poster_path) then
      raise exception 'O vídeo do momento precisa de uma imagem de capa enviada pela plataforma.';
    end if;
    if new.duration_s is null or new.duration_s not between 1 and 31 then raise exception 'O vídeo pode ter até 30 segundos.'; end if;
  else
    new.poster_path := null;
    new.duration_s := null;
  end if;
  if new.link_kind = 'service' then
    if not exists (select 1 from public.services s where s.id = new.link_id and s.house_id = new.house_id and s.active) then raise exception 'O serviço escolhido não está disponível.'; end if;
  elsif new.link_kind = 'event' then
    if not exists (select 1 from public.events e where e.id = new.link_id and e.house_id = new.house_id and e.status = 'publicado') then raise exception 'O ritual escolhido não está disponível.'; end if;
  end if;
  new.caption := nullif(btrim(coalesce(new.caption, '')), '');
  perform pg_advisory_xact_lock(hashtextextended('moments:' || new.house_id::text, 0));
  select count(*) into v_n from public.stories s where s.house_id = new.house_id and s.created_at > now() - interval '24 hours';
  if v_n >= v_cap then raise exception 'Você chegou ao limite de % momento(s) por dia do seu plano.', v_cap; end if;
  new.image_url := null;
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.hidden_at := null;
  new.purged_at := null;
  return new;
end $$;

revoke execute on function public.stories_guard() from public, anon, authenticated;

drop trigger if exists stories_guard on public.stories;

create trigger stories_guard before insert on public.stories for each row execute function public.stories_guard();

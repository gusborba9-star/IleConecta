-- 0164 — Momentos: o limite por dia conta o que foi PUBLICADO, não o que ainda está no ar (correção, 18/11/2026).
-- Antes: apagar um momento devolvia a vaga (publicar 10, apagar 10, publicar mais 10...). Agora cada publicação fica em um registro
-- que apagar não mexe; o limite olha as últimas 24 horas desse registro. O registro some depois de 3 dias.

create table if not exists public.moment_publish_log (
  id bigint generated always as identity primary key,
  house_id uuid not null references public.houses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists moment_publish_log_house on public.moment_publish_log (house_id, created_at desc);

alter table public.moment_publish_log enable row level security;

revoke all on public.moment_publish_log from public, anon, authenticated;

-- o que já foi publicado nas últimas 24 h entra no registro (uma vez só)
insert into public.moment_publish_log (house_id, created_at)
select s.house_id, s.created_at from public.stories s
 where s.created_at > now() - interval '24 hours'
   and not exists (select 1 from public.moment_publish_log l where l.house_id = s.house_id and l.created_at = s.created_at);

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
  select count(*) into v_n from public.moment_publish_log l where l.house_id = new.house_id and l.created_at > now() - interval '24 hours';
  if v_n >= v_cap then raise exception 'Você chegou ao limite de % momento(s) por dia do seu plano.', v_cap; end if;
  insert into public.moment_publish_log (house_id) values (new.house_id);
  new.image_url := null;
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.hidden_at := null;
  new.purged_at := null;
  return new;
end $$;
revoke execute on function public.stories_guard() from public, anon, authenticated;

-- quantos já foram publicados nas últimas 24 h (só a dona da casa; a tela mostra "você ainda pode publicar N")
create or replace function public.moments_published_today(p_house uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_house_owner(p_house) then raise exception 'Operação inválida.' using errcode = '42501'; end if;
  return (select count(*)::int from public.moment_publish_log l where l.house_id = p_house and l.created_at > now() - interval '24 hours');
end $$;

revoke all on function public.moments_published_today(uuid) from public, anon;

grant execute on function public.moments_published_today(uuid) to authenticated;

do $$
begin
  perform cron.schedule('purge-moment-publish-log', '59 3 * * *', 'delete from public.moment_publish_log where created_at < now() - interval ''3 days''');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

-- 0162 — Momentos das casas (decisão do proprietário, 17/11/2026). Substitui o cartão "Momento indisponível" do protótipo.
-- Só as casas publicam (a partir do Essencial; vídeo de até 30 s só no Premium); o momento fica visível por 24 h e o arquivo é apagado do
-- armazenamento em 48 h (denúncia aberta, ou resolvida há menos de 90 dias, segura o arquivo como prova). Três denúncias de pessoas diferentes
-- escondem o momento até a administração decidir. Limites e vídeo vivem na matriz de planos (editáveis no painel).
-- 1) matriz de planos: moments_per_day (número) e moment_video (liga/desliga), com a matriz salva ganhando só o que falta.
-- 2) stories vira "momentos": colunas novas, trava no banco (plano, limite diário, arquivo da própria casa, vínculo com serviço/ritual).
-- 3) bucket "moments" (leitura pública, escrita só da própria casa e só com o plano).
-- 4) limpeza em 48 h pela rotina de arquivos que já existe (files_to_purge / files_purged), também para arquivos órfãos do bucket.
-- 5) denúncias, ocultação automática e fila da administração.
-- 6) moments_feed(): o carrossel do feed (casas que a pessoa segue primeiro).

-- ============ 1) matriz de planos ============
create or replace function public.plan_matrix_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text;
  nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20],"limit_services":[0,1000],"limit_rituals":[0,1000],"limit_posts_month":[0,1000],"moments_per_day":[0,50]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video','styled_posts','moment_video'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 19 then return false; end if;
    for k in select jsonb_object_keys(nums) loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'number' then return false; end if;
      if (v ->> k) !~ '^[0-9]{1,6}$' then return false; end if;
      if (v ->> k)::int < (nums -> k ->> 0)::int or (v ->> k)::int > (nums -> k ->> 1)::int then return false; end if;
    end loop;
    foreach k in array flags loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'boolean' then return false; end if;
    end loop;
    v := m -> 'copy' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if coalesce(jsonb_typeof(v -> 'tagline'), '') <> 'string' then return false; end if;
    if char_length(btrim(v ->> 'tagline')) not between 1 and 120 then return false; end if;
    if coalesce(jsonb_typeof(v -> 'benefits'), '') <> 'array' then return false; end if;
    if jsonb_array_length(v -> 'benefits') > 12 then return false; end if;
    for b in select jsonb_array_elements(v -> 'benefits') loop
      if coalesce(jsonb_typeof(b), '') <> 'object' then return false; end if;
      if coalesce(jsonb_typeof(b -> 'text'), '') <> 'string' then return false; end if;
      if char_length(btrim(b ->> 'text')) not between 1 and 200 then return false; end if;
      t := coalesce(jsonb_typeof(b -> 'feature'), 'null');
      if t = 'string' then
        if not ((b ->> 'feature') = any (feats)) then return false; end if;
      elsif t <> 'null' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.plan_matrix_default() returns jsonb
language sql immutable set search_path = public as $$
  select '{"caps":{"gratis":{"assistant_replies":0,"campaign_links":0,"campaign_card_styles":0,"quick_replies":0,"included_seats":0,"limit_services":3,"limit_rituals":2,"limit_posts_month":8,"moments_per_day":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":false,"moment_video":false},"base":{"assistant_replies":100,"campaign_links":0,"campaign_card_styles":0,"quick_replies":3,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":3,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":false,"moment_video":false},"intermediario":{"assistant_replies":500,"campaign_links":2,"campaign_card_styles":1,"quick_replies":10,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":5,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":true,"moment_video":false},"maximo":{"assistant_replies":1700,"campaign_links":30,"campaign_card_styles":3,"quick_replies":50,"included_seats":1,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":10,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true,"styled_posts":true,"moment_video":true}},"copy":{"gratis":{"tagline":"Comece a receber pessoas, sem mensalidade.","benefits":[{"text":"Página da casa, feed e avaliações dos clientes","feature":null},{"text":"Link e QR code da sua casa, para compartilhar onde quiser","feature":null},{"text":"Até {limit_services} serviços e {limit_rituals} rituais ativos, sempre com o pagamento da plataforma","feature":null},{"text":"Até {limit_posts_month} publicações por mês","feature":null},{"text":"Chat em texto","feature":null},{"text":"Assistente com pacote avulso de respostas, sem assinar nada","feature":null},{"text":"Impulsionamento e destaque quando quiser, pagando por dia","feature":null}]},"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Tudo do Grátis, sem limite de serviços, rituais e publicações","feature":null},{"text":"A assistente atende e vende (até {assistant_replies} respostas por mês)","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"Você escolhe vender pela plataforma ou combinar direto com o cliente","feature":null},{"text":"Datas públicas na agenda da casa","feature":null},{"text":"Momentos no topo do feed: até {moments_per_day} por dia, visíveis por 24 horas","feature":null}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com letras na sua identidade (fonte, cor e tamanho) e texto sempre legível","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"},{"text":"Momentos em vídeo de até 30 segundos, além das fotos (até {moments_per_day} por dia)","feature":null}]}}}'::jsonb;
$$;

do $$
declare v jsonb; p text; ben jsonb; t_base text := 'Momentos no topo do feed: até {moments_per_day} por dia, visíveis por 24 horas'; t_max text := 'Momentos em vídeo de até 30 segundos, além das fotos (até {moments_per_day} por dia)';
begin
  select value into v from public.platform_settings where key = 'plan_matrix';
  if v is null then return; end if;
  foreach p in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    if not ((v -> 'caps' -> p) ? 'moments_per_day') then
      v := jsonb_set(v, array['caps', p, 'moments_per_day'], to_jsonb(case p when 'base' then 3 when 'intermediario' then 5 when 'maximo' then 10 else 0 end));
    end if;
    if not ((v -> 'caps' -> p) ? 'moment_video') then
      v := jsonb_set(v, array['caps', p, 'moment_video'], to_jsonb(p = 'maximo'));
    end if;
  end loop;
  ben := v -> 'copy' -> 'base' -> 'benefits';
  if jsonb_typeof(ben) = 'array' and jsonb_array_length(ben) < 12 and not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' = t_base) then
    v := jsonb_set(v, '{copy,base,benefits}', ben || jsonb_build_array(jsonb_build_object('text', t_base, 'feature', null)));
  end if;
  ben := v -> 'copy' -> 'maximo' -> 'benefits';
  if jsonb_typeof(ben) = 'array' and jsonb_array_length(ben) < 12 and not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' = t_max) then
    v := jsonb_set(v, '{copy,maximo,benefits}', ben || jsonb_build_array(jsonb_build_object('text', t_max, 'feature', null)));
  end if;
  if public.plan_matrix_ok(v) then
    update public.platform_settings set value = v, updated_at = now() where key = 'plan_matrix';
  end if;
end
$$;

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

-- Depois de publicado, só a ocultação/expiração por função da administração muda (não existe política de update para a casa).

-- ============ 3) bucket moments ============
create or replace function public.can_publish_moment(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses h where h.owner_id = (select auth.uid())
    and public.plan_cap_int(h.plan::text, 'moments_per_day') > 0
    and (p_name !~* '\.(mp4|webm|mov)$' or public.plan_cap_bool(h.plan::text, 'moment_video')));
$$;
revoke execute on function public.can_publish_moment(text) from public, anon;
grant execute on function public.can_publish_moment(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', true, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists moments_read on storage.objects;
drop policy if exists moments_insert on storage.objects;
drop policy if exists moments_delete on storage.objects;
create policy moments_read on storage.objects for select using (bucket_id = 'moments');
create policy moments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_publish_moment(name));
create policy moments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============ 5a) denúncias (antes da limpeza, que as consulta) ============
create table if not exists public.moment_reports (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null,
  house_id uuid not null references public.houses(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('conteudo_improprio', 'golpe', 'assedio', 'outro')),
  media_path text,
  poster_path text,
  media_kind text,
  caption text,
  status text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_note text,
  unique (story_id, reporter_id)
);
create index if not exists moment_reports_story on public.moment_reports (story_id);
create index if not exists moment_reports_open on public.moment_reports (status, created_at);
alter table public.moment_reports enable row level security;
revoke all on public.moment_reports from public, anon, authenticated;

-- ============ 4) limpeza em 48 h ============
create or replace function public.files_to_purge(p_limit integer default 200)
returns table (bucket text, path text, kind text, ref uuid)
language sql stable security definer set search_path = public as $$
  (select 'ritual-records'::text, er.path, 'record'::text, er.id
     from public.event_records er
    where er.expires_at < now()
    order by er.expires_at limit p_limit)
  union all
  (select 'ritual-records'::text, o.name, 'orphan'::text, null::uuid
     from storage.objects o
    where o.bucket_id = 'ritual-records' and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.event_records er where er.path = o.name)
    order by o.created_at limit p_limit)
  union all
  (select 'chat-files'::text, m.attachment_path, 'chat'::text, m.id
     from public.messages m
    where m.deleted_at is not null and m.deleted_at < now() - interval '30 days'
      and m.attachment_path is not null
      and not exists (
        select 1 from public.report_files rf join public.chat_reports cr on cr.id = rf.report_id
         where rf.bucket = 'chat-files' and rf.path = m.attachment_path
           and (cr.status = 'aberta' or cr.resolved_at is null or cr.resolved_at > now() - interval '90 days'))
    order by m.deleted_at limit p_limit)
  union all
  (select rf.bucket, rf.path, 'evidence'::text, rf.report_id
     from public.report_files rf join public.chat_reports cr on cr.id = rf.report_id
    where rf.bucket = 'report-evidence' and cr.status = 'resolvida' and cr.resolved_at < now() - interval '90 days'
    order by cr.resolved_at limit p_limit)
  union all
  -- momentos: arquivo sai do armazenamento 48 h depois de publicado, salvo denúncia aberta (ou resolvida há menos de 90 dias)
  (select 'moments'::text, s.media_path, 'moment'::text, s.id
     from public.stories s
    where s.created_at < now() - interval '48 hours' and s.media_path is not null
      and not exists (select 1 from public.moment_reports r where (r.story_id = s.id or r.media_path = s.media_path)
                       and (r.status = 'aberta' or r.resolved_at > now() - interval '90 days'))
    order by s.created_at limit p_limit)
  union all
  (select 'moments'::text, s.poster_path, 'moment_poster'::text, s.id
     from public.stories s
    where s.created_at < now() - interval '48 hours' and s.poster_path is not null
      and not exists (select 1 from public.moment_reports r where (r.story_id = s.id or r.poster_path = s.poster_path)
                       and (r.status = 'aberta' or r.resolved_at > now() - interval '90 days'))
    order by s.created_at limit p_limit)
  union all
  -- arquivos do bucket sem momento (casa apagou o momento ou o envio não terminou): saem depois de 2 dias, salvo denúncia
  (select 'moments'::text, o.name, 'orphan'::text, null::uuid
     from storage.objects o
    where o.bucket_id = 'moments' and o.created_at < now() - interval '2 days'
      and not exists (select 1 from public.stories s where s.media_path = o.name or s.poster_path = o.name)
      and not exists (select 1 from public.moment_reports r where (r.media_path = o.name or r.poster_path = o.name)
                       and (r.status = 'aberta' or r.resolved_at > now() - interval '90 days'))
    order by o.created_at limit p_limit);
$$;

create or replace function public.files_purged(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare i jsonb; n integer := 0;
begin
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if i->>'kind' = 'record' then
      delete from public.event_records where id = (i->>'ref')::uuid;
    elsif i->>'kind' = 'orphan' then
      null; -- o arquivo já saiu do armazenamento; não há referência no banco
    elsif i->>'kind' = 'chat' then
      update public.messages set attachment_path = null, attachment_type = null, attachment_name = null, attachment_size = null
       where id = (i->>'ref')::uuid;
    elsif i->>'kind' = 'evidence' then
      delete from public.report_files where report_id = (i->>'ref')::uuid and bucket = i->>'bucket' and path = i->>'path';
    elsif i->>'kind' = 'moment' then
      update public.stories set media_path = null, purged_at = coalesce(purged_at, now()) where id = (i->>'ref')::uuid;
    elsif i->>'kind' = 'moment_poster' then
      update public.stories set poster_path = null, purged_at = coalesce(purged_at, now()) where id = (i->>'ref')::uuid;
    else
      continue;
    end if;
    -- momento sem nenhum arquivo e sem denúncia: a linha também sai (a prova de denúncia mantém a linha)
    if i->>'kind' in ('moment', 'moment_poster') then
      delete from public.stories s where s.id = (i->>'ref')::uuid and s.media_path is null and s.poster_path is null
        and not exists (select 1 from public.moment_reports r where r.story_id = s.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.files_to_purge(integer) from public, anon, authenticated;
revoke all on function public.files_purged(jsonb) from public, anon, authenticated;
grant execute on function public.files_to_purge(integer) to service_role;
grant execute on function public.files_purged(jsonb) to service_role;

-- ============ 5b) denunciar, ocultar e decidir ============
create or replace function public.report_moment(p_story uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s record; v_n int;
begin
  if v_uid is null then raise exception 'Entre na sua conta para denunciar.' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('conteudo_improprio', 'golpe', 'assedio', 'outro') then raise exception 'Escolha o motivo da denúncia.'; end if;
  select * into s from public.stories where id = p_story and expires_at > now() and purged_at is null and media_path is not null;
  if not found or not public.house_visible_to_me(s.house_id) then raise exception 'Momento indisponível.'; end if;
  if public.is_house_owner(s.house_id) then raise exception 'Você não pode denunciar o próprio momento.'; end if;
  if (select count(*) from public.moment_reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Muitas denúncias hoje. Tente novamente amanhã.';
  end if;
  insert into public.moment_reports (story_id, house_id, reporter_id, reason, media_path, poster_path, media_kind, caption)
    values (s.id, s.house_id, v_uid, p_reason, s.media_path, s.poster_path, s.media_kind, s.caption)
    on conflict (story_id, reporter_id) do nothing;
  select count(distinct r.reporter_id) into v_n from public.moment_reports r where r.story_id = s.id and r.status = 'aberta';
  if v_n >= 3 then update public.stories set hidden_at = coalesce(hidden_at, now()) where id = s.id; end if;
  return 'ok';
end $$;

create or replace function public.admin_moment_reports() returns table (
  story_id uuid, house_id uuid, house_name text, caption text, media_kind text, media_path text, poster_path text,
  first_report timestamptz, n_reports bigint, reasons text[], hidden boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('moderacao') then raise exception 'Acesso restrito à moderação.' using errcode = '42501'; end if;
  return query
  select r.story_id, r.house_id, h.name, max(r.caption), max(r.media_kind), max(r.media_path), max(r.poster_path), min(r.created_at),
         count(*), array_agg(distinct r.reason), coalesce(bool_or(s.hidden_at is not null), false)
    from public.moment_reports r join public.houses h on h.id = r.house_id left join public.stories s on s.id = r.story_id
   where r.status = 'aberta'
   group by r.story_id, r.house_id, h.name
   order by min(r.created_at);
end $$;

create or replace function public.admin_moment_decide(p_story uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('moderacao') then raise exception 'Acesso restrito à moderação.' using errcode = '42501'; end if;
  if p_action not in ('manter', 'remover') then raise exception 'Ação inválida.'; end if;
  if not exists (select 1 from public.moment_reports r where r.story_id = p_story and r.status = 'aberta') then raise exception 'Não há denúncia aberta para este momento.'; end if;
  if p_action = 'manter' then
    update public.stories set hidden_at = null where id = p_story;
  else
    update public.stories set expires_at = least(expires_at, now()), hidden_at = coalesce(hidden_at, now()) where id = p_story;
  end if;
  update public.moment_reports set status = case when p_action = 'remover' then 'procedente' else 'improcedente' end,
         resolved_at = now(), admin_note = nullif(btrim(coalesce(p_note, '')), '')
   where story_id = p_story and status = 'aberta';
  return p_action;
end $$;

revoke all on function public.report_moment(uuid, text), public.admin_moment_reports(), public.admin_moment_decide(uuid, text, text) from public, anon;
grant execute on function public.report_moment(uuid, text), public.admin_moment_reports(), public.admin_moment_decide(uuid, text, text) to authenticated;

-- ============ 6) carrossel do feed ============
create or replace function public.moments_feed(p_limit integer default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.g order by x.latest desc) from (
      select max(s.created_at) as latest, jsonb_build_object(
          'owner_id', h.owner_id, 'house_id', h.id, 'name', h.name, 'slug', h.slug, 'avatar', p.avatar_url,
          'followed', exists (select 1 from public.follows f where f.follower_id = v_uid and f.house_id = h.id),
          'items', jsonb_agg(jsonb_build_object(
              'id', s.id, 'kind', s.media_kind, 'path', s.media_path, 'poster', s.poster_path, 'caption', s.caption,
              'created_at', s.created_at, 'expires_at', s.expires_at, 'duration', s.duration_s,
              'link_kind', case when sv.id is not null then 'service' when ev.id is not null then 'event' end,
              'link_id', coalesce(sv.id, ev.id), 'link_title', coalesce(sv.title, ev.title)) order by s.created_at)) as g
        from public.stories s
        join public.houses h on h.id = s.house_id
        join public.profiles p on p.id = h.owner_id
        left join public.services sv on s.link_kind = 'service' and sv.id = s.link_id and sv.house_id = s.house_id and sv.active
        left join public.events ev on s.link_kind = 'event' and ev.id = s.link_id and ev.house_id = s.house_id and ev.status = 'publicado'
       where s.expires_at > now() and s.hidden_at is null and s.purged_at is null and s.media_path is not null
         and public.house_visible_to_me(h.id)
       group by h.id, h.owner_id, h.name, h.slug, p.avatar_url
       order by max(s.created_at) desc
       limit greatest(1, least(coalesce(p_limit, 40), 60))) x), '[]'::jsonb);
end $$;
revoke all on function public.moments_feed(integer) from public, anon;
grant execute on function public.moments_feed(integer) to authenticated;

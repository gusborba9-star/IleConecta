-- Avaliações de quem comprou. Construído e DESLIGADO por padrão (features.reviews.state = 'on' no painel admin).
-- Só avalia quem teve serviço concluído ou participou de ritual encerrado (até 60 dias depois), uma avaliação por compra.
-- A casa responde e pode contestar; a administração esconde. A tabela fica fechada por RLS: tudo passa por funções.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  service_order_id uuid unique references public.service_orders(id) on delete cascade,
  reservation_id uuid unique references public.reservations(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 600),
  anonymous boolean not null default false,
  reply text check (reply is null or char_length(reply) <= 600),
  replied_at timestamptz,
  reported_at timestamptz,
  report_reason text check (report_reason is null or char_length(report_reason) <= 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (((service_order_id is not null)::int + (reservation_id is not null)::int) = 1)
);
create index if not exists reviews_house on public.reviews (house_id, created_at desc);
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

create or replace function public.reviews_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value -> 'reviews' ->> 'state' = 'on' from public.platform_settings where key = 'features'), false);
$$;

create or replace function public.my_reviewable()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or not public.reviews_enabled() then '[]'::jsonb else coalesce((
    select jsonb_agg(x order by (x ->> 'done_at') desc) from (
      select jsonb_build_object('kind', 'servico', 'ref', so.id, 'house_owner_id', h.owner_id, 'house_name', h.name, 'title', so.title,
             'done_at', coalesce(so.finished_at, so.updated_at)) x
      from public.service_orders so join public.houses h on h.id = so.house_id
      where so.client_id = auth.uid() and so.status = 'concluido'
        and coalesce(so.finished_at, so.updated_at) > now() - interval '60 days'
        and not exists (select 1 from public.reviews r where r.service_order_id = so.id)
      union all
      select jsonb_build_object('kind', 'ritual', 'ref', rs.id, 'house_owner_id', h.owner_id, 'house_name', h.name, 'title', e.title,
             'done_at', coalesce(e.finished_at, e.ends_at, e.starts_at))
      from public.reservations rs join public.events e on e.id = rs.event_id join public.houses h on h.id = e.house_id
      where rs.user_id = auth.uid() and rs.status = 'confirmada'
        and (e.status = 'encerrado' or (e.ends_at is not null and e.ends_at < now()))
        and coalesce(e.finished_at, e.ends_at, e.starts_at) > now() - interval '60 days'
        and not exists (select 1 from public.reviews r where r.reservation_id = rs.id)
    ) q), '[]'::jsonb) end;
$$;

create or replace function public.submit_review(p_kind text, p_ref uuid, p_rating int, p_comment text default null, p_anonymous boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_house uuid; v_owner uuid; v_name text; v_id uuid; v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para avaliar.'; end if;
  if not public.reviews_enabled() then raise exception 'As avaliações ainda não estão disponíveis.'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Escolha de 1 a 5 estrelas.'; end if;
  if v_comment is not null and char_length(v_comment) > 600 then raise exception 'O comentário pode ter até 600 caracteres.'; end if;
  if p_kind = 'servico' then
    select so.house_id into v_house from public.service_orders so
      where so.id = p_ref and so.client_id = auth.uid() and so.status = 'concluido'
        and coalesce(so.finished_at, so.updated_at) > now() - interval '60 days';
  elsif p_kind = 'ritual' then
    select e.house_id into v_house from public.reservations rs join public.events e on e.id = rs.event_id
      where rs.id = p_ref and rs.user_id = auth.uid() and rs.status = 'confirmada'
        and (e.status = 'encerrado' or (e.ends_at is not null and e.ends_at < now()))
        and coalesce(e.finished_at, e.ends_at, e.starts_at) > now() - interval '60 days';
  else
    raise exception 'Tipo de compra inválido.';
  end if;
  if v_house is null then raise exception 'Só é possível avaliar uma compra concluída, em até 60 dias.'; end if;
  begin
    insert into public.reviews (house_id, author_id, service_order_id, reservation_id, rating, comment, anonymous)
    values (v_house, auth.uid(), case when p_kind = 'servico' then p_ref end, case when p_kind = 'ritual' then p_ref end, p_rating, v_comment, coalesce(p_anonymous, false))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Você já avaliou esta compra.';
  end;
  select owner_id, name into v_owner, v_name from public.houses where id = v_house;
  insert into public.notifications (user_id, text, href)
    values (v_owner, 'Nova avaliação de ' || p_rating || case when p_rating = 1 then ' estrela' else ' estrelas' end || '. Toque para ver e responder.', '/casa/' || v_owner || '?aba=avaliacoes');
  return v_id;
end $$;

create or replace function public.reply_review(p_review uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v_text text := btrim(coalesce(p_text, '')); v_author uuid; v_owner uuid;
begin
  if char_length(v_text) < 1 or char_length(v_text) > 600 then raise exception 'A resposta deve ter de 1 a 600 caracteres.'; end if;
  select r.author_id, h.owner_id into v_author, v_owner from public.reviews r join public.houses h on h.id = r.house_id where r.id = p_review;
  if v_owner is null or v_owner is distinct from auth.uid() then raise exception 'Só a casa avaliada pode responder.'; end if;
  update public.reviews set reply = v_text, replied_at = now() where id = p_review;
  insert into public.notifications (user_id, text, href)
    values (v_author, 'A casa respondeu à sua avaliação.', '/casa/' || v_owner || '?aba=avaliacoes');
end $$;

create or replace function public.report_review(p_review uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then raise exception 'Explique o motivo em 5 a 300 caracteres.'; end if;
  select h.owner_id into v_owner from public.reviews r join public.houses h on h.id = r.house_id where r.id = p_review;
  if v_owner is null or v_owner is distinct from auth.uid() then raise exception 'Só a casa avaliada pode contestar.'; end if;
  update public.reviews set reported_at = now(), report_reason = v_reason where id = p_review;
end $$;

create or replace function public.house_reviews(p_owner uuid, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_house uuid; res jsonb;
begin
  if not public.reviews_enabled() then return jsonb_build_object('enabled', false); end if;
  select id into v_house from public.houses where owner_id = p_owner;
  if v_house is null then return jsonb_build_object('enabled', true, 'count', 0, 'avg', 0, 'dist', '{}'::jsonb, 'items', '[]'::jsonb); end if;
  select jsonb_build_object(
    'enabled', true,
    'count', count(*),
    'avg', coalesce(round(avg(rating)::numeric, 1), 0),
    'dist', jsonb_build_object('1', count(*) filter (where rating = 1), '2', count(*) filter (where rating = 2), '3', count(*) filter (where rating = 3),
                                '4', count(*) filter (where rating = 4), '5', count(*) filter (where rating = 5)))
  into res from public.reviews where house_id = v_house and not hidden;
  res := res || jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment,
        'author', case when r.anonymous then 'Cliente' else coalesce(nullif(split_part(btrim(p.display_name), ' ', 1), ''), 'Cliente') end,
        'created_at', r.created_at, 'reply', r.reply, 'replied_at', r.replied_at, 'mine', r.author_id = auth.uid(), 'reported', r.reported_at is not null,
        'source', case when r.service_order_id is not null then 'servico' else 'ritual' end) order by r.created_at desc)
    from (select * from public.reviews where house_id = v_house and not hidden order by created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) r
    join public.profiles p on p.id = r.author_id), '[]'::jsonb));
  return res;
end $$;

create or replace function public.review_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.reviews_enabled() then '{}'::jsonb else coalesce((
    select jsonb_object_agg(h.owner_id::text, jsonb_build_object('avg', s.a, 'count', s.n))
    from (select house_id, round(avg(rating)::numeric, 1) a, count(*) n from public.reviews where not hidden group by house_id) s
    join public.houses h on h.id = s.house_id), '{}'::jsonb) end;
$$;

create or replace function public.admin_reported_reviews()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'house', h.name, 'rating', r.rating, 'comment', r.comment, 'report_reason', r.report_reason,
      'reported_at', r.reported_at, 'hidden', r.hidden) order by r.reported_at desc)
    from public.reviews r join public.houses h on h.id = r.house_id where r.reported_at is not null), '[]'::jsonb);
end $$;

create or replace function public.admin_set_review_hidden(p_review uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.reviews set hidden = coalesce(p_hidden, false) where id = p_review;
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'review_moderation', null, jsonb_build_object('review', p_review, 'hidden', p_hidden));
end $$;

revoke all on function public.reviews_enabled(), public.my_reviewable(), public.submit_review(text,uuid,int,text,boolean), public.reply_review(uuid,text), public.report_review(uuid,text), public.house_reviews(uuid,int), public.review_summary(), public.admin_reported_reviews(), public.admin_set_review_hidden(uuid,boolean) from public, anon;
grant execute on function public.my_reviewable(), public.submit_review(text,uuid,int,text,boolean), public.reply_review(uuid,text), public.report_review(uuid,text), public.house_reviews(uuid,int), public.review_summary(), public.admin_reported_reviews(), public.admin_set_review_hidden(uuid,boolean) to authenticated;

-- Pedido de avaliação: quando o serviço conclui ou o ritual encerra (só com o recurso ligado). Nunca atrapalha a operação.
create or replace function public.review_ask_service()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_name text;
begin
  if new.status = 'concluido' and old.status is distinct from 'concluido' and public.reviews_enabled() then
    select owner_id, name into v_owner, v_name from public.houses where id = new.house_id;
    insert into public.notifications (user_id, text, href)
      values (new.client_id, 'Seu serviço com a casa ' || v_name || ' foi concluído. Conte como foi a sua experiência.', '/casa/' || v_owner || '?aba=avaliacoes');
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.review_ask_service() from public, anon, authenticated;
create trigger trg_review_ask_service after update of status on public.service_orders for each row execute function public.review_ask_service();

create or replace function public.review_ask_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_name text;
begin
  if new.status = 'encerrado' and old.status is distinct from 'encerrado' and public.reviews_enabled() then
    select owner_id, name into v_owner, v_name from public.houses where id = new.house_id;
    insert into public.notifications (user_id, text, href)
      select rs.user_id, 'O ritual "' || new.title || '" da casa ' || v_name || ' foi encerrado. Conte como foi a sua experiência.', '/casa/' || v_owner || '?aba=avaliacoes'
      from public.reservations rs where rs.event_id = new.id and rs.status = 'confirmada';
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.review_ask_event() from public, anon, authenticated;
create trigger trg_review_ask_event after update of status on public.events for each row execute function public.review_ask_event();

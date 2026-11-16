-- PASSO 285: 0131_pessoas_da_casa — parte 2 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) quem está logado: titular ou equipe, e o que pode ver ============
create or replace function public.house_people_ctx(out house_id uuid, out owner_id uuid, out titular boolean, out can_chat boolean, out can_orders boolean, out can_members boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_perms text[] := '{}'; v_plan text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select h.id, h.owner_id, h.plan::text into house_id, owner_id, v_plan from public.houses h where h.owner_id = v_uid order by h.created_at limit 1;
  if house_id is not null then titular := true;
  else
    titular := false;
    select s.house_id, s.perms into house_id, v_perms from public.staff_row() s limit 1;
    if house_id is null then raise exception 'not_house' using errcode = '42501'; end if;
    select h.owner_id, h.plan::text into owner_id, v_plan from public.houses h where h.id = house_id;
  end if;
  can_chat := titular or 'chat_read' = any (v_perms) or 'chat_reply' = any (v_perms);
  can_orders := titular or 'orders' = any (v_perms);
  can_members := public.plan_cap_bool(v_plan, 'members_area') and (titular or 'members' = any (v_perms));
  if not (can_chat or can_orders or can_members) then raise exception 'sem_permissao' using errcode = '42501'; end if;
end $$;

revoke all on function public.house_people_ctx() from public, anon, authenticated;

-- ============ 3) lista com segmentos ============
create or replace function public.house_people(p_segment text default 'todos', p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  x record; v_seg text := lower(coalesce(nullif(btrim(p_segment), ''), 'todos'));
  v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_lim int := least(greatest(coalesce(p_limit, 50), 1), 100); v_off int := greatest(coalesce(p_offset, 0), 0);
  res jsonb;
begin
  if v_seg not in ('todos', 'seguidor', 'conversou', 'interessado', 'cliente', 'recorrente', 'participante', 'membro', 'pendencia', 'sumido') then
    raise exception 'segmento_invalido' using errcode = '22023';
  end if;
  if v_q is not null and char_length(v_q) > 80 then v_q := left(v_q, 80); end if;
  select * into x from public.house_people_ctx();
  with b as (select * from public.house_people_base(x.house_id, x.owner_id, x.can_chat, x.can_orders, x.can_members, x.titular)),
  sel as (
    select b.* from b where case v_seg when 'todos' then true when 'seguidor' then b.seguidor when 'conversou' then b.conversou
      when 'interessado' then b.interessado when 'cliente' then b.cliente when 'recorrente' then b.recorrente when 'participante' then b.participante
      when 'membro' then b.membro when 'pendencia' then b.pendencia when 'sumido' then b.sumido else false end
      and (v_q is null or b.name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
  )
  select jsonb_build_object(
    'generated_at', now(), 'house_id', x.house_id, 'role', case when x.titular then 'titular' else 'equipe' end, 'segment', v_seg,
    'total', (select count(*) from sel),
    'counts', (select jsonb_build_object('todos', count(*), 'seguidor', count(*) filter (where seguidor), 'conversou', count(*) filter (where conversou),
        'interessado', count(*) filter (where interessado), 'cliente', count(*) filter (where cliente), 'recorrente', count(*) filter (where recorrente),
        'participante', count(*) filter (where participante), 'membro', count(*) filter (where membro), 'pendencia', count(*) filter (where pendencia),
        'sumido', count(*) filter (where sumido)) from b),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('person_id', s.person_id, 'name', s.name, 'avatar_url', s.avatar_url, 'city', s.city, 'state', s.state,
        'segments', (select coalesce(jsonb_agg(t.k), '[]'::jsonb) from (values (1, 'seguidor', s.seguidor), (2, 'conversou', s.conversou), (3, 'interessado', s.interessado),
            (4, 'cliente', s.cliente), (5, 'recorrente', s.recorrente), (6, 'participante', s.participante), (7, 'membro', s.membro), (8, 'pendencia', s.pendencia),
            (9, 'sumido', s.sumido)) as t(o, k, on_) where t.on_),
        'purchases', s.purchases, 'spent_cents', s.spent_cents, 'first_at', s.first_at, 'last_at', s.last_at) order by s.last_at desc nulls last, s.name, s.person_id), '[]'::jsonb)
      from (select * from sel order by last_at desc nulls last, name, person_id limit v_lim offset v_off) s),
    'scope', 'Só pessoas com relação real com a sua casa. Lê as tabelas originais na hora; não guarda cópia. Para atender e acompanhar, não para envio em massa.')
  into res;
  return res;
end $$;

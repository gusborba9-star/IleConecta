-- Calendário religioso da casa. Construído e DESLIGADO por padrão (features.calendar.state = 'on' no painel admin).
-- Cada casa cadastra as datas que observa (cada tradição tem as suas) e decide, data a data, QUEM vê, com quatro chaves independentes:
--   vis_public    = rede: qualquer pessoa, inclusive sem login (link público da casa)
--   vis_followers = quem segue a casa
--   vis_house     = calendário interno da casa (agenda e lembretes para a própria casa)
--   vis_assistant = a assistente virtual pode informar a data aos clientes
-- A casa sempre enxerga e edita todas as suas datas, qualquer que seja a combinação. A tabela fica fechada por RLS: tudo passa por funções.
create table if not exists public.house_calendar_items (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  tradition text check (tradition is null or char_length(tradition) <= 40),
  kind text not null default 'celebracao' check (kind in ('celebracao', 'obrigacao', 'gira', 'outro')),
  on_date date not null,
  yearly boolean not null default true,
  note text check (note is null or char_length(note) <= 300),
  vis_public boolean not null default false,
  vis_followers boolean not null default false,
  vis_house boolean not null default true,
  vis_assistant boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists house_calendar_items_house on public.house_calendar_items (house_id, on_date);
alter table public.house_calendar_items enable row level security;
revoke all on public.house_calendar_items from anon, authenticated;

create or replace function public.calendar_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value -> 'calendar' ->> 'state' = 'on' from public.platform_settings where key = 'features'), false);
$$;

-- A casa vê tudo (com as chaves); os demais veem só o que a casa liberou para a rede ou, se seguem a casa, para seguidores.
create or replace function public.house_calendar(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_house uuid; v_own boolean := (p_owner = auth.uid()); v_follower boolean := false;
begin
  if not public.calendar_enabled() then return jsonb_build_object('enabled', false, 'items', '[]'::jsonb); end if;
  select id into v_house from public.houses where owner_id = p_owner;
  if v_house is null then return jsonb_build_object('enabled', true, 'items', '[]'::jsonb); end if;
  if not v_own and auth.uid() is not null then
    v_follower := exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.house_id = v_house);
  end if;
  return jsonb_build_object('enabled', true, 'items', coalesce((
    select jsonb_agg(
      jsonb_build_object('id', c.id, 'title', c.title, 'tradition', c.tradition, 'kind', c.kind, 'date', c.on_date, 'yearly', c.yearly, 'note', c.note)
      || case when v_own then jsonb_build_object('vis_public', c.vis_public, 'vis_followers', c.vis_followers, 'vis_house', c.vis_house, 'vis_assistant', c.vis_assistant) else '{}'::jsonb end
      order by c.on_date, c.title)
    from public.house_calendar_items c
    where c.house_id = v_house and (v_own or c.vis_public or (v_follower and c.vis_followers))), '[]'::jsonb));
end $$;

create or replace function public.save_calendar_item(p_id uuid, p_title text, p_tradition text, p_kind text, p_date date, p_yearly boolean, p_note text,
                                                     p_vis_public boolean, p_vis_followers boolean, p_vis_house boolean, p_vis_assistant boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_house uuid; v_id uuid := p_id; v_title text := btrim(coalesce(p_title, ''));
        v_trad text := nullif(btrim(coalesce(p_tradition, '')), ''); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if not public.calendar_enabled() then raise exception 'O calendário ainda não está disponível.'; end if;
  select id into v_house from public.houses where owner_id = auth.uid();
  if v_house is null then raise exception 'Só casas têm calendário.'; end if;
  if char_length(v_title) < 2 or char_length(v_title) > 80 then raise exception 'O nome da data deve ter de 2 a 80 caracteres.'; end if;
  if v_trad is not null and char_length(v_trad) > 40 then raise exception 'A tradição pode ter até 40 caracteres.'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'A observação pode ter até 300 caracteres.'; end if;
  if p_kind is null or p_kind not in ('celebracao', 'obrigacao', 'gira', 'outro') then raise exception 'Escolha o tipo da data.'; end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > date '2100-12-31' then raise exception 'Informe uma data válida.'; end if;
  if v_id is null then
    if (select count(*) from public.house_calendar_items where house_id = v_house) >= 80 then raise exception 'Limite de 80 datas no calendário.'; end if;
    insert into public.house_calendar_items (house_id, title, tradition, kind, on_date, yearly, note, vis_public, vis_followers, vis_house, vis_assistant)
      values (v_house, v_title, v_trad, p_kind, p_date, coalesce(p_yearly, true), v_note,
              coalesce(p_vis_public, false), coalesce(p_vis_followers, false), coalesce(p_vis_house, true), coalesce(p_vis_assistant, false))
      returning id into v_id;
  else
    update public.house_calendar_items set title = v_title, tradition = v_trad, kind = p_kind, on_date = p_date, yearly = coalesce(p_yearly, true), note = v_note,
        vis_public = coalesce(p_vis_public, false), vis_followers = coalesce(p_vis_followers, false), vis_house = coalesce(p_vis_house, true), vis_assistant = coalesce(p_vis_assistant, false)
      where id = v_id and house_id = v_house;
    if not found then raise exception 'Data não encontrada.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_calendar_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  delete from public.house_calendar_items c using public.houses h where c.id = p_id and c.house_id = h.id and h.owner_id = auth.uid();
end $$;

revoke all on function public.calendar_enabled(), public.house_calendar(uuid), public.save_calendar_item(uuid,text,text,text,date,boolean,text,boolean,boolean,boolean,boolean), public.delete_calendar_item(uuid) from public, anon;
grant execute on function public.calendar_enabled(), public.house_calendar(uuid) to anon, authenticated;
grant execute on function public.save_calendar_item(uuid,text,text,text,date,boolean,text,boolean,boolean,boolean,boolean), public.delete_calendar_item(uuid) to authenticated;

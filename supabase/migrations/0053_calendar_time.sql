-- Agenda da Casa: horário de início de cada data (ex.: "Gira às 21h"), para a página pública e para a Assistente informarem com clareza.
-- Rode DEPOIS da 0052. O horário é opcional.
alter table public.house_calendar_items add column if not exists on_time time;

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
      jsonb_build_object('id', c.id, 'title', c.title, 'tradition', c.tradition, 'kind', c.kind, 'date', c.on_date, 'time', to_char(c.on_time, 'HH24:MI'), 'yearly', c.yearly, 'note', c.note)
      || case when v_own then jsonb_build_object('vis_public', c.vis_public, 'vis_followers', c.vis_followers, 'vis_house', c.vis_house, 'vis_assistant', c.vis_assistant) else '{}'::jsonb end
      order by c.on_date, c.on_time nulls last, c.title)
    from public.house_calendar_items c
    where c.house_id = v_house and (v_own or c.vis_public or (v_follower and c.vis_followers))), '[]'::jsonb));
end $$;

-- Substitui a versão da 0052 (sem horário) por uma com o parâmetro p_time.
drop function if exists public.save_calendar_item(uuid, text, text, text, date, boolean, text, boolean, boolean, boolean, boolean);

create or replace function public.save_calendar_item(p_id uuid, p_title text, p_tradition text, p_kind text, p_date date, p_yearly boolean, p_note text,
                                                     p_vis_public boolean, p_vis_followers boolean, p_vis_house boolean, p_vis_assistant boolean, p_time text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_house uuid; v_id uuid := p_id; v_title text := btrim(coalesce(p_title, ''));
        v_trad text := nullif(btrim(coalesce(p_tradition, '')), ''); v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_time_txt text := nullif(btrim(coalesce(p_time, '')), ''); v_time time;
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
  if v_time_txt is not null then
    if v_time_txt !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Informe um horário válido, como 21:00.'; end if;
    v_time := v_time_txt::time;
  end if;
  if v_id is null then
    if (select count(*) from public.house_calendar_items where house_id = v_house) >= 80 then raise exception 'Limite de 80 datas no calendário.'; end if;
    insert into public.house_calendar_items (house_id, title, tradition, kind, on_date, on_time, yearly, note, vis_public, vis_followers, vis_house, vis_assistant)
      values (v_house, v_title, v_trad, p_kind, p_date, v_time, coalesce(p_yearly, true), v_note,
              coalesce(p_vis_public, false), coalesce(p_vis_followers, false), coalesce(p_vis_house, true), coalesce(p_vis_assistant, false))
      returning id into v_id;
  else
    update public.house_calendar_items set title = v_title, tradition = v_trad, kind = p_kind, on_date = p_date, on_time = v_time, yearly = coalesce(p_yearly, true), note = v_note,
        vis_public = coalesce(p_vis_public, false), vis_followers = coalesce(p_vis_followers, false), vis_house = coalesce(p_vis_house, true), vis_assistant = coalesce(p_vis_assistant, false)
      where id = v_id and house_id = v_house;
    if not found then raise exception 'Data não encontrada.'; end if;
  end if;
  return v_id;
end $$;

revoke all on function public.house_calendar(uuid), public.save_calendar_item(uuid,text,text,text,date,boolean,text,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.house_calendar(uuid) to anon, authenticated;
grant execute on function public.save_calendar_item(uuid,text,text,text,date,boolean,text,boolean,boolean,boolean,boolean,text) to authenticated;

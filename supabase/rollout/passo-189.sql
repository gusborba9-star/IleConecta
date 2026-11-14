-- PASSO 189: 0104_vitrine_casa_bloqueada — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) listagens por função (ignoram a política de leitura) ============
create or replace function public.house_featured()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(h.owner_id::text, x.until), '{}'::jsonb)
  from (select house_id, max(expires_at) until from public.house_rewards where expires_at > now() and starts_at <= now() group by house_id) x
  join public.houses h on h.id = x.house_id
  where not public.house_is_hidden(h.id);
$$;

create or replace function public.house_calendar(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_house uuid; v_own boolean := (p_owner = auth.uid()); v_follower boolean := false;
begin
  if not public.calendar_enabled() then return jsonb_build_object('enabled', false, 'items', '[]'::jsonb); end if;
  select id into v_house from public.houses where owner_id = p_owner;
  if v_house is null then return jsonb_build_object('enabled', true, 'items', '[]'::jsonb); end if;
  if not v_own and not public.house_visible_to_me(v_house) then return jsonb_build_object('enabled', true, 'items', '[]'::jsonb); end if;
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

-- ============ 5) permissões ============
revoke all on function public.house_billing_on(), public.house_is_hidden(uuid), public.house_has_open_ties(uuid), public.house_visible_to_me(uuid),
public.hidden_house_new_guard(), public.hidden_house_conversation_guard() from public, anon, authenticated;

-- só a política de leitura precisa ser chamável por quem consulta; saber se uma casa está bloqueada não é público
grant execute on function public.house_visible_to_me(uuid) to anon, authenticated, service_role;

grant execute on function public.house_billing_on(), public.house_is_hidden(uuid), public.house_has_open_ties(uuid) to service_role;

grant execute on function public.house_featured() to anon, authenticated, service_role;

grant execute on function public.house_calendar(uuid) to anon, authenticated, service_role;

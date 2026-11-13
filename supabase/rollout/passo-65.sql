-- PASSO 65: 0085_matriz_de_planos — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.staff_perm(k text)
returns uuid language sql stable security definer set search_path = public as $$
  select s.house_id from public.staff_row() s
  where (k = any (s.perms) or (k = 'chat_read' and 'chat_reply' = any (s.perms)))
    and (k <> 'members' or public.plan_cap_bool((select h.plan::text from public.houses h where h.id = s.house_id), 'members_area'));
$$;

create or replace function public.ritual_video_enabled(p_house uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f jsonb; st text; own uuid; pl text;
begin
  select value -> 'ritual_video' into f from public.platform_settings where key = 'features';
  st := coalesce(f ->> 'state', 'off');
  select owner_id, plan::text into own, pl from public.houses where id = p_house;
  if own is null or not public.plan_cap_bool(pl, 'ritual_video') then return false; end if;
  if st = 'on' then return true; end if;
  if st = 'beta' then return coalesce(f -> 'beta_houses', '[]'::jsonb) ? own::text; end if;
  return false;
end $$;

-- ============ 5) permissões ============
revoke all on function public.plan_matrix_default(), public.plan_matrix_ok(jsonb), public.plan_matrix(), public.plan_cap_int(text, text), public.plan_cap_bool(text, text) from public, anon, authenticated;

grant execute on function public.plan_matrix(), public.plan_cap_int(text, text), public.plan_cap_bool(text, text) to service_role;

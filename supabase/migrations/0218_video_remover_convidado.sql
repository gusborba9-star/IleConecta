-- A casa pode retirar convidados da sala; quem é removido não volta àquela reunião (decisão do proprietário, 24/11/2026).
-- O banco guarda a remoção e nega a entrada (video_join_check). Quem estiver com chave antiga do provedor é retirado de novo assim que
-- o aviso de entrada chegar (video_removed_check, só pelo servidor). A remoção vale só para a reunião e some junto com ela.
create table if not exists public.video_removed (
  meeting_id uuid not null references public.video_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_by uuid not null references public.profiles(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
alter table public.video_removed enable row level security;
revoke all on public.video_removed from public, anon, authenticated;

do $m$
declare d text; nd text;
begin
  d := pg_get_functiondef('public.video_join_check(uuid)'::regprocedure);
  nd := replace(d, E'  if not v_ok then return jsonb_build_object(''ok'', false, ''reason'', ''sem_acesso''); end if;\n',
    E'  if not v_ok then return jsonb_build_object(''ok'', false, ''reason'', ''sem_acesso''); end if;\n  if not v_host and exists (select 1 from public.video_removed vr where vr.meeting_id = m.id and vr.user_id = v_uid) then return jsonb_build_object(''ok'', false, ''reason'', ''removido''); end if;\n');
  if nd = d then raise exception 'video_join_check: texto esperado não encontrado'; end if;
  execute nd;
end $m$;

-- A dona retira alguém da reunião em andamento. Devolve o necessário para o servidor tirar a pessoa da sala no provedor.
create or replace function public.video_remove(p_meeting uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.video_meetings;
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select vm.* into m from public.video_meetings vm join public.houses h on h.id = vm.house_id where vm.id = p_meeting and h.owner_id = uid;
  if not found then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'A reunião já terminou.'; end if;
  if p_user is null or p_user = uid then raise exception 'Escolha outra pessoa.'; end if;
  if (select count(*) from public.video_removed where meeting_id = m.id) >= 200 then raise exception 'Limite de remoções desta reunião atingido.'; end if;
  insert into public.video_removed (meeting_id, user_id, removed_by) values (m.id, p_user, uid) on conflict do nothing;
  return jsonb_build_object('provider', m.provider, 'room_name', m.room_name);
end $$;
revoke execute on function public.video_remove(uuid, uuid) from public, anon;
grant execute on function public.video_remove(uuid, uuid) to authenticated;

-- Só o servidor (aviso de entrada do provedor): esta pessoa foi removida desta sala?
create or replace function public.video_removed_check(p_room text, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.video_removed r join public.video_meetings m on m.id = r.meeting_id where m.room_name = p_room and r.user_id = p_user);
$$;
revoke all on function public.video_removed_check(text, uuid) from public, anon, authenticated;
grant execute on function public.video_removed_check(text, uuid) to service_role;

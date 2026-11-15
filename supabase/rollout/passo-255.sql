-- PASSO 255: 0121_moderacao_fase2 — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 9) Casa: ver o que foi sinalizado e contestar (7 dias corridos)
create or replace function public.my_moderation_flags()
returns table (id uuid, house_name text, target_table text, reason text, excerpt text, status text, created_at timestamptz, orientation_at timestamptz,
  warned_at timestamptz, deadline_at timestamptz, hidden_at timestamptz, contested_at timestamptz, contest_text text, contest_decision text,
  contest_until timestamptz, admin_note text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  perform public.moderation_enforce();
  return query
    select f.id, h.name, f.target_table, f.reason, f.excerpt, f.status, f.created_at, f.orientation_at, f.warned_at, f.deadline_at, f.hidden_at,
      f.contested_at, f.contest_text, f.contest_decision, case when f.warned_at is null then null else f.warned_at + interval '7 days' end, f.admin_note
    from public.moderation_flags f join public.houses h on h.id = f.house_id
    where h.owner_id = auth.uid() and f.status in ('orientada', 'advertida', 'ocultada', 'contestada')
       or (h.owner_id = auth.uid() and f.status = 'encerrada' and f.closed_at > now() - interval '30 days' and f.warned_at is not null)
    order by f.created_at desc limit 100;
end $$;

create or replace function public.contest_moderation_flag(p_flag uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.moderation_flags; adm record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if coalesce(char_length(btrim(p_text)), 0) < 10 or char_length(p_text) > 2000 then raise exception 'Explique a sua contestação em pelo menos 10 caracteres (máximo 2000).'; end if;
  select f2.* into f from public.moderation_flags f2 join public.houses h on h.id = f2.house_id where f2.id = p_flag and h.owner_id = auth.uid() for update of f2;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if f.status not in ('advertida', 'ocultada') then raise exception 'Este registro não aceita contestação agora.'; end if;
  if f.contested_at is not null then raise exception 'Este registro já foi contestado.'; end if;
  if now() > f.warned_at + interval '7 days' then raise exception 'O prazo de 7 dias para contestar terminou.'; end if;
  update public.moderation_flags set status = 'contestada', contested_at = now(), contest_text = btrim(p_text) where id = f.id;
  for adm in select user_id from public.admins loop
    insert into public.notifications (user_id, text, href) values (adm.user_id, 'Nova contestação de moderação aguardando análise.', '/admin');
  end loop;
end $$;

-- ============ 10) Permissões
revoke all on function public.moderation_notify(uuid, text), public.moderation_promise_watch(), public.moderation_scan(), public.moderation_enforce(), public.moderation_hidden_guard() from public, anon, authenticated;

revoke all on function public.admin_moderation_list(text), public.admin_moderation_start_adaptation(), public.admin_moderation_scan(), public.admin_moderation_act(uuid, text, text),
  public.my_moderation_flags(), public.contest_moderation_flag(uuid, text) from public, anon;

grant execute on function public.admin_moderation_list(text), public.admin_moderation_start_adaptation(), public.admin_moderation_scan(), public.admin_moderation_act(uuid, text, text),
  public.my_moderation_flags(), public.contest_moderation_flag(uuid, text) to authenticated;

revoke all on table public.moderation_flags, public.moderation_settings from public, anon, authenticated;

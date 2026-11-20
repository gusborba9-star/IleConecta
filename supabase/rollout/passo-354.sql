-- PASSO 354: 0170_momentos_protecao_de_menores — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) decidir: a casa recebe o aviso ============
create or replace function public.admin_moment_decide(p_story uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare s record; v_menor boolean;
begin
  if not public.admin_can('moderacao') then raise exception 'Acesso restrito à moderação.' using errcode = '42501'; end if;
  if p_action not in ('manter', 'remover') then raise exception 'Ação inválida.'; end if;
  if not exists (select 1 from public.moment_reports r where r.story_id = p_story and r.status = 'aberta') then raise exception 'Não há denúncia aberta para este momento.'; end if;
  select * into s from public.stories where id = p_story;
  select bool_or(r.reason = 'menor') into v_menor from public.moment_reports r where r.story_id = p_story and r.status = 'aberta';
  if p_action = 'manter' then
    update public.stories set hidden_at = null where id = p_story;
  else
    update public.stories set expires_at = least(expires_at, now()), hidden_at = coalesce(hidden_at, now()) where id = p_story;
  end if;
  update public.moment_reports set status = case when p_action = 'remover' then 'procedente' else 'improcedente' end,
         resolved_at = now(), admin_note = nullif(btrim(coalesce(p_note, '')), '')
   where story_id = p_story and status = 'aberta';
  if found and s.id is not null then
    if p_action = 'remover' then perform public.moment_notify_house(s.house_id, case when coalesce(v_menor, false) then 'removido_menor' else 'removido' end);
    elsif s.hidden_at is not null and s.expires_at > now() then perform public.moment_notify_house(s.house_id, 'devolvido');
    end if;
  end if;
  return p_action;
end $$;

revoke all on function public.admin_moment_decide(uuid, text, text) from public, anon;

grant execute on function public.admin_moment_decide(uuid, text, text) to authenticated;

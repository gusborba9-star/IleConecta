-- PASSO 254: 0121_moderacao_fase2 — parte 4 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.admin_moderation_act(p_flag uuid, p_action text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  f public.moderation_flags; s public.moderation_settings; in_adapt boolean; v_deadline timestamptz; hrs text;
begin
  if not public.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Observação muito longa.'; end if;
  select * into f from public.moderation_flags where id = p_flag for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if f.status = 'encerrada' then raise exception 'Este registro já foi encerrado.'; end if;
  select * into s from public.moderation_settings where id;
  in_adapt := s.adaptation_start is null or now() < s.adaptation_start + make_interval(days => s.adaptation_days);
  perform set_config('app.moderation', '1', true);

  if p_action = 'orientar' then
    if f.status not in ('pendente', 'orientada') then raise exception 'Este registro já passou da fase de orientação.'; end if;
    update public.moderation_flags set status = 'orientada', orientation_at = now(), admin_note = coalesce(p_note, admin_note), handled_by = auth.uid() where id = f.id;
    perform public.moderation_notify(f.house_id, 'Dica de ajuste no seu anúncio: veja a orientação educativa do Ilê Conecta.');
    return 'orientada';

  elsif p_action = 'advertir' then
    if f.status not in ('pendente', 'orientada') then raise exception 'Este registro já recebeu advertência.'; end if;
    if in_adapt and f.reason = 'promessa' then raise exception 'Estamos no período de adaptação: neste período só é possível orientar, sem advertência.'; end if;
    v_deadline := now() + case f.reason when 'contato_antigo' then interval '15 days' else interval '72 hours' end;
    update public.moderation_flags set status = 'advertida', warned_at = now(), deadline_at = v_deadline, admin_note = coalesce(p_note, admin_note), handled_by = auth.uid() where id = f.id;
    hrs := case f.reason when 'contato_antigo' then '15 dias' else '72 horas' end;
    perform public.moderation_notify(f.house_id, 'Notificação de advertência e ajuste de conteúdo: você tem ' || hrs || ' para corrigir um anúncio. Veja os detalhes.');
    return 'advertida';

  elsif p_action = 'ocultar' then
    if f.status not in ('advertida', 'contestada') then raise exception 'Só é possível ocultar depois da advertência.'; end if;
    execute format('update public.%I set moderation_hidden = true where id = $1', f.target_table) using f.target_id;
    update public.moderation_flags set status = 'ocultada', hidden_at = coalesce(hidden_at, now()), admin_note = coalesce(p_note, admin_note), handled_by = auth.uid() where id = f.id;
    perform public.moderation_notify(f.house_id, 'Um anúncio foi ocultado até o ajuste. Veja os detalhes e como contestar.');
    return 'ocultada';

  elsif p_action = 'manter' then
    if f.status <> 'contestada' then raise exception 'Só dá para manter a decisão de uma contestação.'; end if;
    update public.moderation_flags set status = case when hidden_at is not null then 'ocultada' else 'advertida' end,
      contest_decision = 'mantida', admin_note = coalesce(p_note, admin_note), handled_by = auth.uid(),
      deadline_at = case when hidden_at is null then greatest(deadline_at, now() + interval '24 hours') else deadline_at end where id = f.id;
    perform public.moderation_notify(f.house_id, 'Analisamos a sua contestação e a decisão foi mantida. Veja a resposta.');
    return 'mantida';

  elsif p_action = 'encerrar' then
    execute format('update public.%I set moderation_hidden = false where id = $1', f.target_table) using f.target_id;
    update public.moderation_flags set status = 'encerrada', closed_at = now(), handled_by = auth.uid(), admin_note = coalesce(p_note, admin_note),
      outcome = case when f.status = 'contestada' then 'contestacao_aceita' else 'dispensado' end where id = f.id;
    if f.status in ('advertida', 'ocultada', 'contestada') then
      perform public.moderation_notify(f.house_id, 'O registro sobre o seu anúncio foi encerrado. Nenhuma pendência.');
    end if;
    return 'encerrada';
  end if;
  raise exception 'Ação inválida.';
end $$;

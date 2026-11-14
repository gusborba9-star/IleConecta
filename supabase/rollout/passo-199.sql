-- PASSO 199: 0107_reembolso_conta_reutilizada_cdc — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2b) avisos-modelo da administração ============
create or replace function public.admin_notify_returning(p_user uuid, p_template text, p_note text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_text text; v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo do aviso (mínimo de 10 caracteres).'; end if;
  if not exists (select 1 from public.account_prior_deleted(p_user)) then raise exception 'Esta conta não tem histórico de conta excluída.'; end if;
  if char_length(v_note) > 300 then raise exception 'A observação deve ter até 300 caracteres.'; end if;
  if p_template = 'reembolso_ja_usado' then
    v_text := 'Aviso do sistema: este endereço de e-mail possui histórico vinculado a uma conta encerrada anteriormente, na qual o reembolso de 7 dias do plano já foi utilizado; por isso ele não é concedido novamente. Se tiver dúvidas, consulte os Termos de Uso ou fale com o suporte.';
  elsif p_template = 'registros_anteriores' then
    v_text := 'Aviso do sistema: este endereço de e-mail possui histórico vinculado a uma conta encerrada anteriormente na plataforma. Caso tenha dúvidas sobre as regras vigentes de contratação ou benefícios, consulte nossos Termos de Uso ou fale com o suporte.';
  elsif p_template = 'livre' then
    if char_length(v_note) < 20 then raise exception 'No aviso livre, escreva de 20 a 300 caracteres.'; end if;
    v_text := v_note; v_note := '';
  else
    raise exception 'Modelo de aviso inválido.';
  end if;
  if v_note <> '' then v_text := v_text || ' Observação: ' || v_note; end if;
  insert into public.notifications (user_id, text, href) values (p_user, v_text, '/suporte');
  insert into public.support_case_log (case_id, actor, action, reason, data) values (null, auth.uid(), 'aviso_conta_reutilizada', left(btrim(p_reason), 300), jsonb_build_object('usuario', p_user, 'modelo', p_template));
end $$;

-- ============ 3) permissões ============
revoke all on function public.house_owner_refund_used_before(uuid), public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.my_plan_refund(),
  public.admin_notify_returning(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.house_owner_refund_used_before(uuid), public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz) to service_role;

grant execute on function public.my_plan_refund() to authenticated, service_role;

grant execute on function public.admin_notify_returning(uuid, text, text, text) to authenticated, service_role;

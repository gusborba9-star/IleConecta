-- PASSO 329: 0160_interruptor_de_emergencia — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0160 — Interruptor de emergência (só o dono). Duas chaves: assistente (IA) e pagamentos. Ligada, a função de borda recusa NOVAS
-- operações daquele módulo com uma mensagem de manutenção em português (padrão ou escrita pelo dono) e o app mostra uma faixa de aviso.
-- Pagamentos desligados NÃO bloqueia o que protege o usuário: webhooks do Stripe, rotinas de conferência, consulta de estado e pedidos de reembolso.
-- Falha segura: se a configuração não puder ser lida ou estiver inválida, nada é bloqueado (a plataforma segue funcionando).
alter table public.platform_settings drop constraint if exists platform_settings_key_check;
alter table public.platform_settings add constraint platform_settings_key_check
  check (key = any (array['features','pricing','scopes','payment_limits','referral','plan_matrix','billing_config','billing_prices','maintenance']));

insert into public.platform_settings (key, value) values ('maintenance', '{"assistant": false, "payments": false, "message": null, "since": null}'::jsonb)
  on conflict (key) do nothing;

create or replace function public.admin_set_maintenance(p_assistant boolean, p_payments boolean, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare old_val jsonb; new_val jsonb; msg text; was_on boolean; since_v text;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_assistant is null or p_payments is null then raise exception 'Informe o estado de cada chave.'; end if;
  msg := nullif(btrim(coalesce(p_message, '')), '');
  if msg is not null and (char_length(msg) > 200 or msg ~ '[<>]') then
    raise exception 'A mensagem de manutenção deve ter até 200 caracteres, sem os sinais < e >.';
  end if;
  select value into old_val from public.platform_settings where key = 'maintenance';
  was_on := coalesce((old_val ->> 'assistant')::boolean, false) or coalesce((old_val ->> 'payments')::boolean, false);
  since_v := case when p_assistant or p_payments then coalesce(case when was_on then old_val ->> 'since' end, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) end;
  new_val := jsonb_build_object('assistant', p_assistant, 'payments', p_payments, 'message', msg, 'since', since_v);
  insert into public.platform_settings (key, value, updated_by) values ('maintenance', new_val, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'maintenance', old_val, new_val);
end $$;
revoke all on function public.admin_set_maintenance(boolean, boolean, text) from public, anon;
grant execute on function public.admin_set_maintenance(boolean, boolean, text) to authenticated;

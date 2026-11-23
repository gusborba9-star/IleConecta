-- 0195 — Endurecimento dos avisos de segurança (23/11/2026), achados na revisão:
-- (1) aviso de "aparelho novo" no máximo 1 a cada 6 h por conta (aba anônima não vira enxurrada de e-mails);
-- (2) limpeza diária dos registros de bloqueio, aparelhos esquecidos, pedidos resolvidos e comunicados já enviados.
create or replace function public.sec_login_ok(p_user uuid, p_device_hash text, p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_had boolean; v_known boolean; v_label text := left(regexp_replace(coalesce(nullif(btrim(p_label), ''), 'Aparelho'), '[^[:alnum:] ·.,()/+-]', '', 'g'), 60);
begin
  select public.email_key(u.email) into v_key from auth.users u where u.id = p_user;
  if v_key is not null then
    update public.security_login_state set fails = 0, last_fail_at = null where email_key = v_key and (locked_until is null or locked_until <= now());
  end if;
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select exists (select 1 from public.security_devices where user_id = p_user) into v_had;
  select exists (select 1 from public.security_devices where user_id = p_user and device_hash = p_device_hash) into v_known;
  if v_known then update public.security_devices set last_seen = now() where user_id = p_user and device_hash = p_device_hash; return null; end if;
  -- no máximo 20 aparelhos guardados por conta (os mais antigos saem)
  delete from public.security_devices where user_id = p_user and device_hash in (select device_hash from public.security_devices where user_id = p_user order by last_seen desc offset 19);
  insert into public.security_devices (user_id, device_hash, label) values (p_user, p_device_hash, v_label) on conflict do nothing;
  if not v_had then return null; end if;
  if exists (select 1 from public.security_events where user_id = p_user and kind = 'login_novo_aparelho' and created_at > now() - interval '6 hours') then return null; end if;
  return public.sec_event_add(p_user, 'login_novo_aparelho', jsonb_build_object('label', v_label));
end $$;
revoke all on function public.sec_login_ok(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sec_login_ok(uuid, text, text) to service_role;

select cron.schedule('security-purge', '41 4 * * *', $job$
  delete from public.security_login_state where (locked_until is null or locked_until < now()) and coalesce(last_fail_at, now() - interval '3 days') < now() - interval '2 days';
  delete from public.security_devices where last_seen < now() - interval '12 months';
  delete from public.security_events where created_at < now() - interval '24 months';
  delete from public.announcement_mails where created_at < now() - interval '30 days';
$job$);

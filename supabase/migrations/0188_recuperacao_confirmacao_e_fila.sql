-- 0188 — Recuperação de acesso: confirmação própria (link só para o e-mail novo), segunda rodada e rotina da fila (Blueprint §18).
alter table public.account_recovery_requests add column if not exists confirm_token_hash text;
alter table public.account_recovery_requests add column if not exists confirm_expires_at timestamptz;
create index if not exists account_recovery_token_idx on public.account_recovery_requests (confirm_token_hash) where confirm_token_hash is not null;

-- Segunda rodada: o pedido anterior só pode ser usado uma vez, pelo mesmo contato.
create or replace function public.recovery_use_parent(p_parent uuid, p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  update public.account_recovery_requests set status = 'concluido'
   where id = p_parent and status = 'segunda_rodada' and contact_email_key = p_key returning id into v;
  return v is not null;
end $$;

-- Guarda só o código irreversível (sha-256) do link; o link em si vai só por e-mail para o endereço novo.
create or replace function public.recovery_issue_confirm(p_id uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_hash is null or char_length(p_hash) <> 64 then return false; end if;
  update public.account_recovery_requests set confirm_token_hash = p_hash, confirm_expires_at = now() + interval '7 days'
   where id = p_id and status = 'aprovado' and apply_at <= now() and confirm_mail_sent_at is null returning id into v;
  return v is not null;
end $$;

create or replace function public.recovery_confirm_lookup(p_hash text)
returns table (id uuid, user_id uuid, new_email text) language sql stable security definer set search_path = '' as $$
  select r.id, r.decision_account, r.contact_email from public.account_recovery_requests r
   where p_hash is not null and char_length(p_hash) = 64 and r.confirm_token_hash = p_hash and r.status = 'confirmacao_enviada' and r.confirm_expires_at > now()
$$;

create or replace function public.recovery_burn_token(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.account_recovery_requests set confirm_token_hash = null where id = p_id
$$;

revoke all on function public.recovery_use_parent(uuid, text), public.recovery_issue_confirm(uuid, text),
  public.recovery_confirm_lookup(text), public.recovery_burn_token(uuid) from public, anon, authenticated;
grant execute on function public.recovery_use_parent(uuid, text), public.recovery_issue_confirm(uuid, text),
  public.recovery_confirm_lookup(text), public.recovery_burn_token(uuid) to service_role;

-- Rotina da fila a cada 10 minutos (mesmo padrão da cobrança: segredo no Vault + cabeçalho).
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'recovery_cron_secret', 'Rotina da fila de e-mails da recuperação de acesso (account-recovery)')
where not exists (select 1 from vault.secrets where name = 'recovery_cron_secret');

select cron.schedule('recovery-queue', '*/10 * * * *', $cron$select net.http_post(url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/account-recovery', headers := jsonb_build_object('Content-Type', 'application/json', 'x-recovery-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_secret'), '')), body := '{"action":"process_queue"}'::jsonb)$cron$);

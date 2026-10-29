-- Notificações no celular (Web Push). Segredos (chave VAPID privada e segredo do gatilho) ficam no Vault, fora do repositório:
--   vault.create_secret(<chave>, 'vapid_private')  e  vault.create_secret(<segredo>, 'push_webhook_secret').

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push: ver as próprias" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- O aparelho se registra (ou troca de dono, se outra conta entrar no mesmo aparelho).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or char_length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Aparelho inválido.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Só a função de envio (service_role) lê os segredos.
create or replace function public.push_config()
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'vapid_private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    'webhook_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'));
$$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- Toda notificação nova dispara o envio ao celular (se a pessoa ativou). Falha no envio nunca bloqueia a notificação.
create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public, vault, net as $$
declare secret text;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then return new; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  perform net.http_post(
    url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')),
    body := jsonb_build_object('user_id', new.user_id, 'text', new.text, 'href', new.href));
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.notify_push() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.notify_push();

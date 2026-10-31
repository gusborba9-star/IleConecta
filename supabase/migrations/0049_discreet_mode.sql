-- Modo discreto: com ele ligado, o aviso no celular chega sem o nome do app, da casa ou do assunto.
alter table public.notification_prefs add column if not exists discreet boolean not null default false;

create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public, vault, net as $$
declare
  secret text;
  q public.notification_prefs%rowtype;
  h int;
  in_quiet boolean;
  hide boolean := false;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then return new; end if;
  select * into q from public.notification_prefs where user_id = new.user_id;
  if found then hide := q.discreet; end if;
  if found and q.quiet_on and new.text not like '%precisa de você%' then
    h := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
    in_quiet := case when q.quiet_start < q.quiet_end then h >= q.quiet_start and h < q.quiet_end
                     when q.quiet_start > q.quiet_end then h >= q.quiet_start or h < q.quiet_end
                     else false end;
    if in_quiet then return new; end if;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  perform net.http_post(
    url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')),
    body := jsonb_build_object('user_id', new.user_id, 'text', case when hide then 'Você tem uma novidade.' else new.text end, 'href', new.href, 'discreet', hide));
  return new;
exception when others then
  return new;
end $$;

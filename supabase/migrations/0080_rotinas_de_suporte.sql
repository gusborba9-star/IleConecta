-- 0080 — Suporte: rotinas de apoio à função de borda "support-admin" e limpeza de provas.
--  * registro de ações feitas pela função de borda (senha, confirmação de e-mail);
--  * fila de limpeza do acesso (login) de contas já anonimizadas, com nova tentativa;
--  * arquivos de provas de chamados apagados com o chamado entram numa fila e saem do armazenamento;
--  * rotina horária que executa as exclusões vencidas.
-- É seguro repetir.

create or replace function public.support_log_action(p_case uuid, p_actor uuid, p_action text, p_reason text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_action is null or char_length(p_action) > 60 then raise exception 'Ação inválida.'; end if;
  insert into public.support_case_log (case_id, actor, action, reason, data) values (p_case, p_actor, p_action, left(p_reason, 300), coalesce(p_data, '{}'::jsonb));
end $$;

create table if not exists public.auth_cleanup_pending (
  user_id uuid primary key,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.auth_cleanup_pending enable row level security;
revoke all on public.auth_cleanup_pending from anon, authenticated;

create table if not exists public.support_files_to_remove (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
alter table public.support_files_to_remove enable row level security;
revoke all on public.support_files_to_remove from anon, authenticated;

-- a limpeza do chamado passa a enfileirar as provas antes de apagar
create or replace function public.purge_support_cases()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.support_files_to_remove (bucket, path)
    select e.bucket, e.path from public.support_case_evidence e join public.support_cases c on c.id = e.case_id
     where c.purge_after is not null and c.purge_after < now()
    on conflict do nothing;
  with d as (delete from public.support_cases where purge_after is not null and purge_after < now() returning id) select count(*) into n from d;
  return n;
end $$;
revoke all on function public.purge_support_cases() from public, anon, authenticated;

create or replace function public.support_files_pending(p_limit integer default 100)
returns table (id uuid, bucket text, path text)
language sql stable security definer set search_path = public as $$
  select f.id, f.bucket, f.path from public.support_files_to_remove f order by f.created_at limit least(greatest(p_limit, 1), 500);
$$;
create or replace function public.support_files_queue(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare i jsonb; n integer := 0;
begin
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.support_files_to_remove (bucket, path) values (i ->> 'bucket', i ->> 'path') on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function public.support_files_done(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.support_files_to_remove where id = any (p_ids) returning 1) select count(*) into n from d;
  return n;
end $$;

create or replace function public.auth_cleanup_pending_list(p_limit integer default 20)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select a.user_id from public.auth_cleanup_pending a where a.attempts < 20 order by a.created_at limit least(greatest(p_limit, 1), 100);
$$;
create or replace function public.auth_cleanup_mark(p_user uuid, p_done boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_done then delete from public.auth_cleanup_pending where user_id = p_user;
  else
    insert into public.auth_cleanup_pending (user_id, attempts, last_error) values (p_user, 1, left(p_error, 300))
      on conflict (user_id) do update set attempts = public.auth_cleanup_pending.attempts + 1, last_error = left(p_error, 300);
  end if;
end $$;

-- a anonimização agenda a limpeza do acesso (a função de borda confirma depois)
create or replace function public.anonymize_account_and_queue(p_user uuid, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare files jsonb;
begin
  files := public.anonymize_account(p_user, p_request);
  insert into public.auth_cleanup_pending (user_id) values (p_user) on conflict do nothing;
  return files;
end $$;

revoke all on function public.support_log_action(uuid, uuid, text, text, jsonb), public.support_files_pending(integer), public.support_files_queue(jsonb), public.support_files_done(uuid[]),
  public.auth_cleanup_pending_list(integer), public.auth_cleanup_mark(uuid, boolean, text), public.anonymize_account_and_queue(uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_log_action(uuid, uuid, text, text, jsonb), public.support_files_pending(integer), public.support_files_queue(jsonb), public.support_files_done(uuid[]),
  public.auth_cleanup_pending_list(integer), public.auth_cleanup_mark(uuid, boolean, text), public.anonymize_account_and_queue(uuid, uuid) to service_role;

-- toda hora, às :20, a função de borda executa as exclusões vencidas e termina o que ficou pela metade
do $$
begin
  perform cron.unschedule('run-account-deletions');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('run-account-deletions', '20 * * * *', $job$
    select net.http_post(
      url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/support-admin',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'), '')),
      body := '{"action":"run_deletions"}'::jsonb)
  $job$);
exception when others then
  raise notice 'pg_cron indisponível: agende a chamada de support-admin manualmente';
end $$;

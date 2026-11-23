-- 0184 — Recuperação de acesso, passo 2 de 3: e-mails vinculados (decisão do proprietário, 23/11/2026).
-- Preenche os e-mails das contas atuais; todo e-mail que uma conta já teve fica vinculado (gatilho em auth.users);
-- a troca de e-mail encerra as sessões abertas; a "conta reutilizada" compara TODOS os e-mails vinculados (atuais e anteriores),
-- então trocar de e-mail não apaga a marca nem devolve benefício já usado (ex.: reembolso de 7 dias). Pode rodar de novo sem problema.
-- Validado em produção (23/11/2026) com transação desfeita: sessões 1→0, tokens de renovação 1→0, vínculo gravado, marca preservada.
insert into public.account_linked_emails (user_id, email, email_key, source, linked_at)
select u.id, lower(btrim(u.email)), public.email_key(u.email), 'cadastro', u.created_at
from auth.users u
where u.email is not null and position('@' in u.email) > 1 and u.email !~* '@invalid\.local$'
on conflict (user_id, email_key) do nothing;

create or replace function public.track_linked_email() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.email is not null and position('@' in new.email) > 1 and new.email !~* '@invalid\.local$' then
    insert into public.account_linked_emails (user_id, email, email_key, source)
    values (new.id, lower(btrim(new.email)), public.email_key(new.email), case when tg_op = 'INSERT' then 'cadastro' else 'troca_suporte' end)
    on conflict (user_id, email_key) do nothing;
  end if;
  if tg_op = 'UPDATE' and old.email is distinct from new.email and new.email !~* '@invalid\.local$' then
    delete from auth.sessions where user_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.track_linked_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_linked_ins on auth.users;
create trigger on_auth_user_email_linked_ins after insert on auth.users
  for each row execute function public.track_linked_email();
drop trigger if exists on_auth_user_email_linked_upd on auth.users;
create trigger on_auth_user_email_linked_upd after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.track_linked_email();

create or replace function public.account_prior_deleted(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
select distinct di.user_id from public.deleted_account_identity di
where di.user_id <> p_user
  and (
    (di.email is not null and public.email_key(di.email) in (select l.email_key from public.account_linked_emails l where l.user_id = p_user))
    or exists (select 1 from public.account_linked_emails d where d.user_id = di.user_id
               and d.email_key in (select l.email_key from public.account_linked_emails l where l.user_id = p_user))
  );
$$;

select cron.schedule('recovery-purge', '37 4 * * *', $job$
  delete from public.account_linked_emails where retain_until < now();
  delete from public.recovery_throttle where window_start < now() - interval '3 days';
  delete from public.account_recovery_requests where purge_after < now();
$job$);

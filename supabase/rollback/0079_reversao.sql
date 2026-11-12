-- Reversão da 0079 (ferramentas de conta): remove suspensão, exportação, exclusão por anonimização e o e-mail de contato.
-- ATENÇÃO: contas JÁ anonimizadas continuam anonimizadas (não há volta) e perdem a marca profiles.deleted_at; confira antes se houve exclusões.
drop trigger if exists trg_reject_suspended on public.messages;
drop trigger if exists trg_reject_suspended on public.reservations;
drop trigger if exists trg_reject_suspended on public.service_orders;
drop trigger if exists trg_reject_suspended on public.reviews;
drop trigger if exists trg_reject_suspended on public.post_comments;
drop trigger if exists trg_reject_suspended on public.posts;
drop trigger if exists trg_reject_suspended on public.events;
drop trigger if exists trg_reject_suspended on public.services;
drop function if exists public.reject_suspended_actor();
drop function if exists public.admin_suspend_account(uuid, text, uuid);
drop function if exists public.admin_unsuspend_account(uuid, text);
drop function if exists public.export_my_data();
drop function if exists public.my_account_status();
drop function if exists public.request_account_deletion(text);
drop function if exists public.cancel_account_deletion();
drop function if exists public.admin_decide_account_deletion(uuid, text, text);
drop function if exists public.account_deletions_due();
drop function if exists public.anonymize_account(uuid, uuid);
drop function if exists public.account_files(uuid);
drop function if exists public.account_deletion_blockers(uuid);
drop function if exists public.is_suspended(uuid);
drop function if exists public.admin_set_support_email(text, text);
drop function if exists public.support_contact_email();
drop table if exists public.account_deletion_requests;
drop table if exists public.account_suspensions;
drop table if exists public.support_contact;
alter table public.profiles drop column if exists deleted_at;

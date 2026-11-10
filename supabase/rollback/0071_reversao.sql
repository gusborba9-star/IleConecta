-- Reversão da 0071 (F4: estado do atendimento). Só use se a 0071 causar problema; a Edge Function nova funciona com ou sem estas peças,
-- mas a anterior à F4 NÃO conhece o estado (a assistente voltaria a responder por cima do humano).
-- 1) Volte o relatório e o aviso ao texto: reaplique as funções notify_push (0049) e house_assistant_report (0035) do repositório.
-- 2) Depois remova as peças novas:
drop trigger if exists trg_messages_handoff on public.messages;
drop function if exists public.trg_messages_handoff();
drop function if exists public.handoff_release(uuid);
drop function if exists public.handoff_take(uuid);
drop function if exists public.conversation_handoff_state(uuid);
drop function if exists public.handoff_actor(uuid);
drop function if exists public.handoff_mark_pending(uuid, uuid, text);
drop function if exists public.handoff_allows_assistant(uuid, uuid);
drop table if exists public.handoff_events;
drop table if exists public.conversation_handoff;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications drop column if exists kind;
do $$ begin perform cron.unschedule('purge-handoff-events'); exception when others then null; end $$;

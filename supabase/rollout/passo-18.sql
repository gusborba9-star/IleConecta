-- PASSO 18 de 18: 0067 h: search_path e auth.uid
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ F11) search_path fixo ============
alter function public.fee_cents(bigint, text) set search_path = public;
alter function public.stage_amount_cents(bigint, integer, integer) set search_path = public;
alter function public.events_guard_seats() set search_path = public;

-- ============ F12) forma eficiente de auth.uid() em RLS (mesma regra; produção ainda usa a forma antiga) ============
create or replace function public.is_house_owner(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses where id = h and owner_id = (select auth.uid()));
$$;
create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = (select auth.uid()));
$$;

-- FIM DO PASSO 18

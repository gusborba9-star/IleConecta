-- Suporte à assistente virtual (função de borda assistant-chat):
--  * messages.from_assistant marca respostas geradas pela assistente (só o servidor pode gravar true);
--  * assistants.model permite escolher o modelo do OpenRouter por casa (null = padrão do servidor);
--  * assistant_usage registra cada resposta para cota mensal, limite por usuário e custo.

alter table public.messages add column if not exists from_assistant boolean not null default false;

alter table public.assistants add column if not exists model text
  check (model is null or char_length(model) between 3 and 100);

-- Cliente nunca pode se passar pela assistente: inserções diretas exigem from_assistant = false.
drop policy if exists msgs_write on public.messages;
create policy msgs_write on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and from_assistant = false
    and public.is_conversation_member(conversation_id)
  );

create table if not exists public.assistant_usage (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  model text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists assistant_usage_house_created on public.assistant_usage (house_id, created_at desc);
create index if not exists assistant_usage_user_created on public.assistant_usage (user_id, created_at desc);

alter table public.assistant_usage enable row level security;
-- A casa vê o consumo da própria assistente. Ninguém grava pelo cliente (somente service role).
drop policy if exists assistant_usage_owner_read on public.assistant_usage;
create policy assistant_usage_owner_read on public.assistant_usage for select to authenticated
  using (public.is_house_owner(house_id));

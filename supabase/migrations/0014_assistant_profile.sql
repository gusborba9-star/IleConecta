-- Perfil completo da casa para a assistente: sobre a casa, tradição, tom, como chegar,
-- perguntas frequentes, o que a casa não faz e quando passar a conversa para a casa.
-- Tudo em um documento JSON validado também no servidor (a assistente só usa o que a casa escreveu).
-- Rode no SQL Editor. É seguro repetir.

alter table public.assistants add column if not exists profile jsonb not null default '{}'::jsonb;

alter table public.assistants drop constraint if exists assistants_profile_shape;
alter table public.assistants add constraint assistants_profile_shape
  check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 12000);

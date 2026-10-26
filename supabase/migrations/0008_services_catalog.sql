-- Catálogo de serviços da casa: novos tipos, forma de realização e validações.
-- Rode no SQL Editor do Supabase. É seguro repetir.

alter type public.service_kind add value if not exists 'cartas';
alter type public.service_kind add value if not exists 'consulta';
alter type public.service_kind add value if not exists 'limpeza';
alter type public.service_kind add value if not exists 'outro';

do $$ begin
  create type public.service_delivery as enum ('presencial', 'transmissao', 'sigilo');
exception when duplicate_object then null; end $$;

alter table public.services
  add column if not exists delivery public.service_delivery not null default 'presencial',
  add column if not exists custom_kind text;

do $$ begin
  alter table public.services add constraint services_title_len check (char_length(title) between 2 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.services add constraint services_price_range check (price_cents > 0 and price_cents <= 10000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.services add constraint services_desc_len check (description is null or char_length(description) <= 600);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.services add constraint services_custom_kind_len check (custom_kind is null or char_length(custom_kind) <= 40);
exception when duplicate_object then null; end $$;

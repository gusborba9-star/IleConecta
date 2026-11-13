-- PASSO 110: 0092_planos_e_foto_da_assistente — parte 2 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) foto da assistente ============
alter table public.assistants add column if not exists avatar_path text;

alter table public.assistants drop constraint if exists assistants_avatar_path_check;

alter table public.assistants add constraint assistants_avatar_path_check check (avatar_path is null or avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/assistant-[0-9]{10,14}\.(webp|jpg)$');

-- a foto precisa estar na pasta da dona da casa, e só casa com plano que inclui a assistente pode ter foto
create or replace function public.assistants_avatar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text;
begin
if new.avatar_path is null then return new; end if;
if tg_op = 'UPDATE' and new.avatar_path is not distinct from old.avatar_path then return new; end if;
select owner_id, plan::text into v_owner, v_plan from public.houses where id = new.house_id;
if v_owner is null or split_part(new.avatar_path, '/', 1) <> v_owner::text then raise exception 'A foto da assistente precisa ser da própria casa.'; end if;
if public.assistant_monthly_limit(v_plan) <= 0 then raise exception 'O plano da casa não inclui a assistente.'; end if;
return new;
end $$;

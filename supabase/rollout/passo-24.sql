-- PASSO 24 de 25: 0070 a: F8 — o cliente não troca o próprio tipo de conta pela API
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ F8 ============
create or replace function public.profiles_guard_account_type()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.account_type is distinct from old.account_type and current_user in ('anon', 'authenticated') then
    raise exception 'O tipo da conta não pode ser alterado.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.profiles_guard_account_type() from public, anon, authenticated;
drop trigger if exists trg_profiles_guard_account_type on public.profiles;
create trigger trg_profiles_guard_account_type before update on public.profiles
  for each row execute function public.profiles_guard_account_type();

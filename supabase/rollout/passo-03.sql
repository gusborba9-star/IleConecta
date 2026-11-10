-- PASSO 3 de 19: 0064 c: confirm_payment e confirm_payment_for
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- Compatibilidade: confirm_payment(ref) continua existindo para chamadores antigos, agora delegando à versão por id.
-- Referência ambígua (mais de uma linha) não é presumida única: falha explicitamente.
create or replace function public.confirm_payment(p_provider_ref text)
returns text language plpgsql security definer set search_path = public as $$
declare n integer; pid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  select count(*), min(id::text)::uuid into n, pid from public.payments where provider_ref = p_provider_ref;
  if n = 0 then return 'desconhecido'; end if;
  if n > 1 then raise exception 'Referência de pagamento ambígua.'; end if;
  return public.confirm_payment_row(pid);
end $$;

-- Trava a linha por id, confere provedor + referência + conta SOB O MESMO LOCK e confirma essa mesma linha.
create or replace function public.confirm_payment_for(p_payment uuid, p_provider text, p_provider_ref text, p_account text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then return 'divergente'; end if;
  if not public.payment_identity_matches(pay, p_provider, p_provider_ref, p_account) then return 'divergente'; end if;
  return public.confirm_payment_row(pay.id);
end $$;

-- FIM DO PASSO 3

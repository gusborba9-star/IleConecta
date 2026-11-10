-- PASSO 11 de 18: 0067 a: convite da equipe
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ F1) convite da equipe ============
CREATE OR REPLACE FUNCTION public.accept_staff_invite(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.house_staff_invites; h public.houses;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar.'; end if;
  select * into i from public.house_staff_invites where token = p_token and used_at is null and expires_at > now() for update;
  if i.token is null then raise exception 'Este convite expirou ou já foi usado.'; end if;
  -- serializa por casa: a contagem de acessos não corre contra outro aceite
  select * into h from public.houses where id = i.house_id for update;
  if h.owner_id = auth.uid() then raise exception 'Este é o convite da sua própria casa.'; end if;
  if (select count(*) from public.house_staff where house_id = h.id) >= public.house_seat_allowance(h.id) then raise exception 'A casa não tem acesso disponível agora.'; end if;
  if exists (select 1 from public.houses where owner_id = auth.uid()) then raise exception 'Use uma conta de cliente para atender pela casa.'; end if;
  if exists (select 1 from public.house_staff where user_id = auth.uid()) then raise exception 'Você já atende por uma casa.'; end if;
  insert into public.house_staff (house_id, user_id, name, perms) values (i.house_id, auth.uid(), i.name, i.perms);
  update public.house_staff_invites set used_at = now() where token = p_token;
  return h.name;
exception when unique_violation then
  raise exception 'Você já atende por uma casa.';
end $function$;

CREATE OR REPLACE FUNCTION public.staff_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  -- serializa a criação de convites da mesma casa (a contagem não corre contra outro convite)
  perform 1 from public.houses where id = new.house_id for update;
  select (select count(*) from public.house_staff where house_id = new.house_id)
       + (select count(*) from public.house_staff_invites where house_id = new.house_id and used_at is null and expires_at > now())
    into n;
  if n >= public.house_seat_allowance(new.house_id) then
    raise exception 'O seu plano não tem acesso disponível. Contrate um acesso extra.';
  end if;
  return new;
end $function$;

-- FIM DO PASSO 11

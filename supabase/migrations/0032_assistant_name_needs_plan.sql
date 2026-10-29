-- O nome da assistente só aparece (e o cliente só vê "escrevendo…") quando ela pode mesmo responder:
-- ativada pela casa e em plano que inclui a assistente (fora o Base). Rode no SQL Editor. É seguro repetir.
create or replace function public.assistant_display_name(p_owner uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(a.display_name), '')
    from public.assistants a join public.houses h on h.id = a.house_id
   where h.owner_id = p_owner and a.enabled and h.plan <> 'base';
$$;

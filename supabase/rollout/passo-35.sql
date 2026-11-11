-- PASSO 35: 0073 — contratar exige serviço contratável
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- Contratar exige serviço contratável (na página ou oferecido a mim no chat).
do $$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.create_service_order(uuid, text)'::regprocedure);
  if position('service_purchasable' in src) > 0 then return; end if;
  patched := replace(src, 'if not found or not svc.active then raise exception ''Este serviço não está disponível.''; end if;',
                          'if not found or not svc.active or not public.service_purchasable(p_service) then raise exception ''Este serviço não está disponível.''; end if;');
  if patched = src then raise exception 'create_service_order: trecho de disponibilidade não encontrado'; end if;
  execute patched;
end $$;

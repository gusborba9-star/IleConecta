-- Correção: depois do aceite único dos Termos do cliente (0022), a contratação de serviço e a reserva de ritual
-- continuavam exigindo o aceite antigo por compra (checkout_servico / checkout_ritual), que o app não grava mais.
-- Resultado: o pagamento falhava com "Aceite as condições..." mesmo com tudo marcado.

create or replace function public.has_client_terms(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.legal_consents c where c.user_id = p_user and c.doc_key = 'termos_cliente');
$$;
revoke all on function public.has_client_terms(uuid) from public, anon, authenticated;

do $$
declare
  fn text;
  def text;
begin
  for fn in select unnest(array['create_service_order', 'reserve_event']) loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn;
    def := replace(def, 'public.has_recent_consent(auth.uid(), ''checkout_servico'')', 'public.has_client_terms(auth.uid())');
    def := replace(def, 'public.has_recent_consent(auth.uid(), ''checkout_ritual'')', 'public.has_client_terms(auth.uid())');
    execute def;
  end loop;
end $$;

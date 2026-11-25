-- 0224 — Modelo do advogado (25/11/2026): versão nova de termo importante vira AVISO + aceite na próxima compra, venda ou assinatura; nada trava a entrada.
-- 0222 fazia house_accepted_terms exigir a versão mínima: um cliente deixava de conseguir comprar de uma casa só porque a CASA ainda não tinha
-- aceitado o texto novo. Isso é bloqueio de quem já pagou/usa. Agora a casa só precisa ter aceitado os Termos da Casa (em qualquer versão) para
-- receber pagamentos; o aceite da versão vigente é pedido à casa no app ao publicar nova oferta paga ou autorizar a cobrança do plano (grava versão, data e IP).
-- has_client_terms continua exigindo a versão mínima: vale só para NOVA compra/reserva (create_service_order e reserve_event), e a tela de compra
-- já grava o aceite vigente antes de chamar. Retomar pagamento de pedido já criado não passa por essa conferência.
create or replace function public.house_accepted_terms(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.legal_consents c where c.user_id = p_owner and c.doc_key = 'termos_casa');
$$;
revoke all on function public.house_accepted_terms(uuid) from public, anon;
grant execute on function public.house_accepted_terms(uuid) to authenticated;

-- A linha da casa na tabela de mínimos fica só como referência do app (DOC_MIN_VERSION); o servidor não bloqueia mais por ela.
comment on table public.legal_min_version is 'Versão mínima dos termos. Servidor usa só termos_cliente (nova compra). termos_casa é aplicado no app (nova venda/assinatura).';

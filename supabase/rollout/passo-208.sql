-- PASSO 208: 0109_casa_excluida_some_da_rede — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0109 — A casa de uma conta excluída some da rede (pedido do proprietário, 14/11/2026).
-- Achado no teste: depois da exclusão a linha da casa ficava pública como "Casa encerrada" na descoberta. Posts, stories e catálogo já eram apagados,
-- mas a casa em si aparecia. Passa a valer a mesma regra da casa inativa (migration 0104): sai da descoberta, da busca, do feed e do link direto
-- ("casa indisponível"), e nada novo é aceito com ela. A administração continua vendo (auditoria). Vale mesmo com a cobrança da plataforma desligada.
-- O histórico de quem já contratou continua funcionando (a tela mostra "Casa" quando a casa não está visível).

create or replace function public.house_is_hidden(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select h is not null and (
  exists (select 1 from public.houses x join public.profiles p on p.id = x.owner_id where x.id = h and p.deleted_at is not null)
  or (public.house_billing_on() and exists (select 1 from public.house_billing_state s where s.house_id = h and (s.total or s.cancelled_at is not null)))
);
$$;

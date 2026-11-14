-- PASSO 187: 0104_vitrine_casa_bloqueada — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0104 — Casa em bloqueio total ou inativa sai da vitrine (decisão do proprietário, 13/11/2026, opção A).
-- Antes desta migration, a leitura de casas, publicações, serviços e eventos era aberta a todos: a casa bloqueada ou inativa continuava aparecendo.
-- Regras:
--  (1) casa em bloqueio total (falta de pagamento) ou inativa (assinatura cancelada/reembolsada) some da descoberta, da busca e do feed
--      (casas, publicações, stories, serviços, eventos, impulsionamentos); o link direto mostra "casa indisponível";
--  (2) continuam vendo a casa: a dona, a equipe, a administração e o cliente que tem pedido em andamento com ela (serviço confirmado/em andamento/
--      reembolso pendente, ou reserva confirmada de ritual que ainda não passou) para concluir o que já contratou;
--  (3) nada novo com a casa nesse estado, nem para esse cliente: reserva, fila de espera, pedido de serviço, seguir e abrir conversa nova são recusados;
--  (4) suspensão parcial NÃO esconde a casa (só pausa vendas novas, campanhas, destaques, impulsionamento e assistente).
-- Tudo no servidor: vale para o aplicativo, para o link direto e para qualquer chamada à API.

-- ============ 1) ajudantes ============
create or replace function public.house_billing_on() returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false);
$$;

create or replace function public.house_is_hidden(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select h is not null and public.house_billing_on() and exists (select 1 from public.house_billing_state s where s.house_id = h and (s.total or s.cancelled_at is not null));
$$;

-- pedido em andamento do cliente logado com a casa
create or replace function public.house_has_open_ties(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select auth.uid() is not null and (
exists (select 1 from public.service_orders o where o.house_id = h and o.client_id = auth.uid() and o.status in ('confirmado', 'em_andamento', 'reembolso_pendente'))
or exists (select 1 from public.reservations r join public.events e on e.id = r.event_id where e.house_id = h and r.user_id = auth.uid() and r.status = 'confirmada' and e.starts_at > now() - interval '1 day'));
$$;

create or replace function public.house_visible_to_me(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select not public.house_is_hidden(h) or public.is_admin() or public.is_house_owner(h)
or exists (select 1 from public.staff_row() s where s.house_id = h) or public.house_has_open_ties(h);
$$;

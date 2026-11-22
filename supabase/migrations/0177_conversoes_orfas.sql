-- 0177 — Conversões atribuídas não sobrevivem à origem (22/11/2026).
-- Orientação jurídica: se a conversa, o pedido ou a reserva de origem forem excluídos, a linha de promo_conversions
-- não pode ficar como atalho para identificar alguém. A limpeza diária passa a apagar também essas linhas órfãs
-- (além da regra de 13 meses). Só reagenda a rotina existente; nenhuma tabela é alterada.
select cron.schedule('purge-promo-conversions', '48 3 * * *', $c$delete from public.promo_conversions c where c.created_at < now() - interval '13 months' or (c.ref_type = 'conversation' and not exists (select 1 from public.conversations x where x.id = c.ref_id)) or (c.ref_type = 'service_order' and not exists (select 1 from public.service_orders x where x.id = c.ref_id)) or (c.ref_type = 'reservation' and not exists (select 1 from public.reservations x where x.id = c.ref_id))$c$);

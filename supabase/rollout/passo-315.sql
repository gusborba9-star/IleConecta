-- PASSO 315: 0149_retirar_tabelas_do_tempo_real — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0149 — Retira mensagens, pedidos, reservas e reembolsos do tempo real (rode DEPOIS que o app com os avisos da 0148 estiver no ar).
-- O app novo escuta só live_pings (a própria linha); as quatro tabelas deixam de ser lidas e decodificadas pelo servidor de tempo real a cada mudança.
-- Avisos (notifications) e live_pings continuam. Os dados e as regras de leitura não mudam.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'service_orders', 'reservations', 'refund_requests'] loop
      if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

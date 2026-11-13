-- PASSO 132: 0095_reembolso_creditos_7_dias — parte 4 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- o saldo do pacote só diminui, exceto na devolução do saldo quando o provedor recusa o estorno (só a função de falha liga essa exceção, dentro da própria transação)
create or replace function public.ai_credit_packs_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Pacote de créditos não pode ser apagado.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.charge_id is distinct from old.charge_id or new.size is distinct from old.size
or new.purchased_at is distinct from old.purchased_at or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
raise exception 'Pacote de créditos não pode ser alterado.';
end if;
if new.remaining > old.remaining and coalesce(current_setting('app.credit_restore', true), '') <> '1' then raise exception 'O saldo do pacote só diminui.'; end if;
return new;
end $$;

-- PASSO 167: 0100_reajuste_tabela_comercial — parte 3 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_price_changes_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reajuste não pode ser apagado.'; end if;
if old.status <> 'anunciado' then raise exception 'Reajuste encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.plan is distinct from old.plan or new.old_cents is distinct from old.old_cents or new.new_cents is distinct from old.new_cents
or new.announced_on is distinct from old.announced_on or new.effective_on is distinct from old.effective_on or new.created_at is distinct from old.created_at then
raise exception 'Valor, plano e datas do reajuste anunciado não podem ser alterados.';
end if;
return new;
end $$;

drop trigger if exists trg_platform_price_changes_guard on public.platform_price_changes;

create trigger trg_platform_price_changes_guard before update or delete on public.platform_price_changes
for each row execute function public.platform_price_changes_guard();

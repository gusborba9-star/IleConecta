-- PASSO 100: 0091_creditos_de_ia — parte 2 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
drop trigger if exists trg_ai_credit_ledger_immutable on public.ai_credit_ledger;

create trigger trg_ai_credit_ledger_immutable before update or delete on public.ai_credit_ledger
for each row execute function public.platform_billing_immutable();

create or replace function public.ai_credit_packs_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Pacote de créditos não pode ser apagado.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.charge_id is distinct from old.charge_id or new.size is distinct from old.size
or new.purchased_at is distinct from old.purchased_at or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
raise exception 'Pacote de créditos não pode ser alterado.';
end if;
if new.remaining > old.remaining then raise exception 'O saldo do pacote só diminui.'; end if;
return new;
end $$;

drop trigger if exists trg_ai_credit_packs_guard on public.ai_credit_packs;

create trigger trg_ai_credit_packs_guard before update or delete on public.ai_credit_packs
for each row execute function public.ai_credit_packs_guard();

-- fatura de pacote estornada pelo provedor: o saldo que sobrou deixa de valer
create or replace function public.ai_credit_packs_on_refund() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if new.kind = 'credit_pack' and new.status = 'estornada' and old.status is distinct from 'estornada' then
update public.ai_credit_packs set remaining = 0 where charge_id = new.id;
end if;
return new;
end $$;

drop trigger if exists trg_platform_charges_credit_refund on public.platform_charges;

create trigger trg_platform_charges_credit_refund after update of status on public.platform_charges
for each row execute function public.ai_credit_packs_on_refund();

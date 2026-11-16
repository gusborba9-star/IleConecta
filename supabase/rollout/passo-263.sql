-- PASSO 263: 0124_aviso_30_dias_bloqueio_total — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) Gatilho: agenda a mudança, guarda o prazo em vigor e avisa as casas
create or replace function public.billing_config_schedule_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'America/Sao_Paulo')::date; o jsonb := old.value; v jsonb := new.value - 'total_block_next';
eff int; pend jsonb; desired int; txt text;
begin
if new.key <> 'billing_config' then return new; end if;
if (o -> 'total_block_next' ->> 'from') is not null and (o -> 'total_block_next' ->> 'from')::date <= today then
  eff := (o -> 'total_block_next' ->> 'days')::int; pend := null;
else
  eff := coalesce(nullif(o ->> 'total_block_days', '')::int, 30); pend := o -> 'total_block_next';
end if;
desired := coalesce(nullif(v ->> 'total_block_days', '')::int, eff);
if desired = eff then
  new.value := v || jsonb_build_object('total_block_days', eff);
  if pend is not null then
    txt := 'Aviso: a mudança do prazo do bloqueio total foi cancelada. O prazo continua de ' || eff || ' dias.';
  end if;
elsif pend is not null and (pend ->> 'days')::int = desired then
  new.value := v || jsonb_build_object('total_block_days', eff, 'total_block_next', pend);
else
  new.value := v || jsonb_build_object('total_block_days', eff, 'total_block_next', jsonb_build_object('days', desired, 'from', to_char(today + 30, 'YYYY-MM-DD')));
  txt := 'Aviso: a partir de ' || to_char(today + 30, 'DD/MM/YYYY') || ', o prazo entre a suspensão parcial e o bloqueio total da casa por falta de pagamento passa de ' || eff || ' para ' || desired || ' dias. Até lá vale o prazo atual.';
end if;
if txt is not null then
  insert into public.notifications (user_id, text, href)
  select distinct h.owner_id, txt, '/planos' from public.houses h
  join public.house_billing_plan b on b.house_id = h.id and b.active
  where not exists (select 1 from public.notifications x where x.user_id = h.owner_id and x.text = txt);
end if;
return new;
end $$;

drop trigger if exists billing_config_schedule_total on public.platform_settings;

create trigger billing_config_schedule_total before update on public.platform_settings
for each row when (new.key = 'billing_config') execute function public.billing_config_schedule_total();

-- ============ 4) permissões (função de gatilho não é chamada por ninguém; tira o acesso padrão)
revoke all on function public.billing_config_schedule_total() from public, anon, authenticated, service_role;

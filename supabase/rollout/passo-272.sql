-- PASSO 272: 0126_cpf_cnpj_da_casa — parte 4 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_seat_issue(p_house uuid, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_seat_quote(p_house, v_day);
perform public.platform_require_tax_id(p_house);
select id into v_open from public.platform_charges where house_id = p_house and kind = 'extra_seat' and idempotency_key like 'upgrade:seat:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind = 'extra_seat' and idempotency_key like 'upgrade:seat:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'upgrade:seat:%';
v_id := public.platform_charge_issue(p_house, 'extra_seat', 'extra_seat', (q ->> 'amount_cents')::bigint, v_day, null, 'Vaga adicional de equipe (valor proporcional)', 'upgrade:seat:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'vaga_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

-- ============ 7) permissões
revoke all on function public.tax_id_kind(text), public.tax_id_format(text), public.tax_id_key(), public.platform_require_tax_id(uuid), public.tax_id_store(uuid, text, uuid, boolean),
  public.my_tax_id_set(text), public.my_tax_id_status(), public.admin_house_tax_id(uuid, text), public.admin_house_tax_id_set(uuid, text, text) from public, anon, authenticated;

grant execute on function public.my_tax_id_set(text), public.my_tax_id_status() to authenticated;

grant execute on function public.admin_house_tax_id(uuid, text), public.admin_house_tax_id_set(uuid, text, text) to authenticated;

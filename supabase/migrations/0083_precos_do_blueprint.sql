-- Preços dos planos conforme o Blueprint §18.1 (aprovado em 12/11/2026): Profissional R$ 179,90 e Premium R$ 299,90.
-- Só troca se a produção ainda estiver com os valores antigos (139,90 e 199,00); não sobrescreve preço que o administrador já tenha alterado.
-- Não liga cobrança real. Registra no histórico do administrador.
do $$
declare old_val jsonb; adm uuid;
begin
  select value into old_val from public.platform_settings where key = 'pricing';
  if old_val is null then return; end if;
  if (old_val #>> '{plans,intermediario,monthly}')::numeric = 139.9 and (old_val #>> '{plans,maximo,monthly}')::numeric = 199 then
    select user_id into adm from public.admins order by created_at limit 1;
    update public.platform_settings
       set value = jsonb_set(jsonb_set(value, '{plans,intermediario,monthly}', '179.9'::jsonb), '{plans,maximo,monthly}', '299.9'::jsonb),
           updated_at = now(), updated_by = adm
     where key = 'pricing';
    if adm is not null then
      insert into public.admin_audit (admin_id, key, old_value, new_value)
        select adm, 'pricing', old_val, value from public.platform_settings where key = 'pricing';
    end if;
  end if;
end $$;

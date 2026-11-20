-- PASSO 350: 0168_identificacao_do_operador — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) histórico (só o dono) ============
create or replace function public.admin_operator_log() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'by', p.display_name, 'name', l.name, 'document', l.document, 'address', l.address, 'email', l.contact_email) order by l.at desc, l.id desc)
    from (select * from public.operator_identity_log order by at desc, id desc limit 20) l left join public.profiles p on p.id = l.by_user), '[]'::jsonb);
end $$;

revoke all on function public.admin_operator_log() from public, anon;

grant execute on function public.admin_operator_log() to authenticated;

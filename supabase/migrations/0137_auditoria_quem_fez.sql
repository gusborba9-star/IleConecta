-- 0137 — Auditoria com "quem fez" (Fase 6 / item 1). SÓ LEITURA, sem tabela nova.
-- admin_audit já grava admin_id em toda alteração; faltava mostrar. Só administração (is_admin).
-- Devolve o rótulo de quem agiu (nome do perfil; se não houver, o e-mail), nunca o conteúdo dos valores antigo/novo.
create or replace function public.admin_audit_feed(p_limit integer default 50, p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'key', x.key, 'created_at', x.created_at, 'admin_id', x.admin_id,
      'actor', coalesce(nullif(btrim(x.display_name), ''), x.email, 'Administrador removido')) order by x.id desc)
    from (
      select a.id, a.key, a.created_at, a.admin_id, p.display_name, u.email
        from public.admin_audit a
        left join public.profiles p on p.id = a.admin_id
        left join auth.users u on u.id = a.admin_id
       where p_before is null or a.id < p_before
       order by a.id desc limit v_lim
    ) x
  ), '[]'::jsonb);
end $$;

revoke execute on function public.admin_audit_feed(integer, bigint) from public, anon, authenticated;
grant execute on function public.admin_audit_feed(integer, bigint) to authenticated;

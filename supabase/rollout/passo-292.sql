-- PASSO 292: 0134_historico_de_plano_e_dias_de_atividade — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  return jsonb_build_object(
    'gerado_em', now(),
    'perfil', (select to_jsonb(p) - 'id' from public.profiles p where p.id = me),
    'casas', coalesce((select jsonb_agg(jsonb_build_object('nome', h.name, 'categoria', h.category, 'plano', h.plan, 'criada_em', h.created_at)) from public.houses h where h.owner_id = me), '[]'::jsonb),
    'aceites', coalesce((select jsonb_agg(jsonb_build_object('documento', c.doc_key, 'versao', c.doc_version, 'em', c.accepted_at) order by c.accepted_at) from public.legal_consents c where c.user_id = me), '[]'::jsonb),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('ritual', e.title, 'status', r.status, 'respostas', r.answers, 'em', r.created_at) order by r.created_at) from public.reservations r join public.events e on e.id = r.event_id where r.user_id = me), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('servico', o.title, 'valor_centavos', o.price_cents, 'status', o.status, 'observacao', o.note, 'em', o.created_at) order by o.created_at) from public.service_orders o where o.client_id = me), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('valor_centavos', p.gross_cents, 'status', p.status, 'metodo', p.payment_method, 'em', p.created_at) order by p.created_at)
        from public.payments p left join public.reservations r on r.id = p.reservation_id left join public.service_orders o on o.id = p.order_id where coalesce(r.user_id, o.client_id) = me), '[]'::jsonb),
    'reembolsos', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.kind, 'status', f.status, 'valor_centavos', f.amount_cents, 'motivo', f.reason, 'em', f.created_at) order by f.created_at) from public.refund_requests f where f.client_id = me), '[]'::jsonb),
    'mensagens_enviadas', coalesce((select jsonb_agg(jsonb_build_object('texto', m.text, 'em', m.created_at) order by m.created_at) from public.messages m where m.sender_id = me and m.deleted_at is null and not m.from_assistant), '[]'::jsonb),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object('texto', c.text, 'em', c.created_at) order by c.created_at) from public.post_comments c where c.user_id = me), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('nota', r.rating, 'comentario', r.comment, 'em', r.created_at) order by r.created_at) from public.reviews r where r.author_id = me), '[]'::jsonb),
    'casas_que_segue', coalesce((select jsonb_agg(h.name) from public.follows f join public.houses h on h.id = f.house_id where f.follower_id = me), '[]'::jsonb),
    'chamados', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.kind, 'titulo', c.title, 'descricao', c.description, 'status', c.status, 'em', c.created_at) order by c.created_at) from public.support_cases c where c.opened_by = me), '[]'::jsonb),
    'dias_de_acesso', coalesce((select jsonb_agg(d.day order by d.day) from public.user_activity_days d where d.user_id = me), '[]'::jsonb));
end $$;

revoke all on function public.export_my_data() from public, anon, authenticated;

grant execute on function public.export_my_data() to authenticated;

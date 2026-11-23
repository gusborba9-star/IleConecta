-- 0186 — Recuperação de acesso: limite de pedidos e busca de contas candidatas (Blueprint §18).
-- Passo 3a: só funções internas, chamadas apenas pela função de servidor (service_role). Nada aqui é público.

-- Limite por janela de 1 hora. Devolve true se ainda pode; false se estourou.
create or replace function public.recovery_throttle_hit(p_bucket text, p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_win timestamptz := date_trunc('hour', now()); v_n int;
begin
  if p_bucket is null or p_bucket = '' or p_limit < 1 then return false; end if;
  insert into public.recovery_throttle (bucket, window_start, n) values (left(p_bucket, 200), v_win, 1)
  on conflict (bucket, window_start) do update set n = public.recovery_throttle.n + 1
  returning n into v_n;
  return v_n <= p_limit;
end $$;

-- Fatos de contas candidatas. Nunca sai daqui para o navegador: só o servidor compara e guarda o resultado.
create or replace function public.recovery_candidate_facts(p_type text, p_name text, p_email_key text, p_city text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tokens text[]; v_out jsonb;
begin
  if p_type not in ('cliente', 'casa') then return '[]'::jsonb; end if;
  select coalesce(array_agg(t), '{}') into v_tokens
    from unnest(regexp_split_to_array(public.recovery_norm_word(p_name), ' ')) t where char_length(t) >= 3;

  with cand as (
    select distinct p.id
    from public.profiles p
    left join public.houses h on h.owner_id = p.id
    where p.account_type::text = p_type and p.deleted_at is null
      and (
        (coalesce(p_email_key, '') <> '' and exists (select 1 from public.account_linked_emails e where e.user_id = p.id and e.email_key = p_email_key))
        or (coalesce(p_email_key, '') <> '' and exists (select 1 from public.account_linked_emails e where e.user_id = p.id and split_part(e.email_key, '@', 2) = split_part(p_email_key, '@', 2)
              and left(split_part(e.email_key, '@', 1), 2) = left(split_part(p_email_key, '@', 1), 2) and char_length(split_part(p_email_key, '@', 1)) >= 2))
        or exists (select 1 from unnest(v_tokens) t where public.recovery_norm_word(coalesce(p.display_name, '')) like '%' || t || '%'
                                                         or public.recovery_norm_word(coalesce(h.name, '')) like '%' || t || '%')
        or (coalesce(p_city, '') <> '' and char_length(public.recovery_norm_word(p_city)) >= 3
            and public.recovery_norm_word(coalesce(p.city, '')) = public.recovery_norm_word(p_city))
      )
    limit 40
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.id,
    'type', p.account_type::text,
    'name', p.display_name,
    'house_name', h.name,
    'emails', coalesce((select jsonb_agg(e.email order by e.linked_at) from public.account_linked_emails e where e.user_id = p.id), '[]'::jsonb),
    'city', p.city,
    'plan', h.plan::text,
    'created_at', p.created_at,
    'last_activity_at', p.last_seen_at,
    'tx', (select jsonb_build_object('count', count(*), 'last_kind', (array_agg(coalesce(o.modality::text, 'servico') order by o.created_at desc))[1],
                'last_value_cents', (array_agg(o.price_cents order by o.created_at desc))[1], 'last_at', max(o.created_at))
           from public.service_orders o
           where o.status in ('confirmado', 'concluido') and (o.client_id = p.id or o.house_id = h.id)),
    'members_count', coalesce((select count(*) from public.house_members m where m.house_id = h.id and m.left_at is null), 0),
    'assistant_name', a.display_name,
    'uses_assistant', coalesce(a.enabled, false),
    'has_staff', coalesce((select bool_or(s.active) from public.house_staff s where s.house_id = h.id), false),
    'top_house_names', coalesce((
        select jsonb_agg(x.name) from (
          select hh.name, count(*) c
          from public.messages msg
          join public.conversation_members cm on cm.conversation_id = msg.conversation_id and cm.user_id <> p.id
          join public.houses hh on hh.owner_id = cm.user_id
          where msg.sender_id = p.id and p.account_type::text = 'cliente'
          group by hh.name order by c desc limit 3) x), '[]'::jsonb)
  )), '[]'::jsonb) into v_out
  from cand c
  join public.profiles p on p.id = c.id
  left join public.houses h on h.owner_id = p.id
  left join public.assistants a on a.house_id = h.id;
  return v_out;
end $$;

revoke all on function public.recovery_throttle_hit(text, int) from public, anon, authenticated;
revoke all on function public.recovery_candidate_facts(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_throttle_hit(text, int) to service_role;
grant execute on function public.recovery_candidate_facts(text, text, text, text) to service_role;

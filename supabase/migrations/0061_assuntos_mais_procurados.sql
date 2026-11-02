-- Assuntos mais procurados: conta, nas conversas da própria casa, os temas que os clientes mais perguntam e os serviços mais pedidos.
-- Só devolve totais; a casa já tem acesso às próprias conversas.

create or replace function public.my_house_topics(p_days int default 30)
returns table (topic text, total bigint)
language sql stable security definer set search_path = public as $$
  with me as (select h.owner_id from public.houses h where h.owner_id = auth.uid()),
  msgs as (
    select lower(m.text) as t
    from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = (select owner_id from me)
    where m.sender_id <> (select owner_id from me)
      and not coalesce(m.from_assistant, false)
      and m.deleted_at is null
      and m.created_at >= now() - make_interval(days => greatest(least(p_days, 365), 1))
  ),
  topics(topic, rx) as (values
    ('Endereço e como chegar', 'endere[cç]o|onde fica|localiza|como chegar|bairro'),
    ('Horários', 'hor[aá]rio|que horas|a que horas|funciona|abre '),
    ('Valores', 'valor|pre[cç]o|quanto custa|quanto [eé]|quanto fica|cobra'),
    ('Agendar e vagas', 'agendar|marcar|reservar|vaga|disponib'),
    ('Rituais e encontros', 'ritual|gira|encontro|festa|cerim[oô]nia|festividade'),
    ('Trabalhos e atendimentos', 'trabalho|atendimento|consulta|jogo|servi[cç]o'),
    ('O que levar e vestir', 'levar|roupa|vestir|vestimenta|traje'),
    ('Pagamento e reembolso', 'pagamento|pagar|pix|cart[aã]o|reembolso|cancel')
  )
  select tp.topic, count(*)::bigint as total
  from topics tp join msgs on msgs.t ~ tp.rx
  group by tp.topic
  order by 2 desc, 1;
$$;
revoke all on function public.my_house_topics(int) from public;
grant execute on function public.my_house_topics(int) to authenticated;

create or replace function public.my_top_services(p_days int default 90)
returns table (title text, total bigint)
language sql stable security definer set search_path = public as $$
  select o.title, count(*)::bigint
  from public.service_orders o
  join public.houses h on h.id = o.house_id and h.owner_id = auth.uid()
  where o.created_at >= now() - make_interval(days => greatest(least(p_days, 365), 1))
  group by o.title
  order by 2 desc, 1
  limit 5;
$$;
revoke all on function public.my_top_services(int) from public;
grant execute on function public.my_top_services(int) to authenticated;

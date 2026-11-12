-- PASSO 63: 0085_matriz_de_planos — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: matriz central de planos (Blueprint §18.1). Limites, ferramentas e textos de cada plano ficam em platform_settings.plan_matrix,
-- editáveis só pelo administrador. O banco e a assistente leem dela; com os valores iniciais, cada plano se comporta exatamente como antes.
-- Se a matriz estiver ausente ou inválida, valem os valores iniciais (nunca fica sem regra).

-- ============ 1) valores iniciais e validação ============
create or replace function public.plan_matrix_default() returns jsonb
language sql immutable set search_path = public as $$
  select '{"caps":{"base":{"assistant_replies":0,"campaign_links":0,"campaign_card_styles":0,"quick_replies":0,"included_seats":0,"assistant_sells":false,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"intermediario":{"assistant_replies":300,"campaign_links":2,"campaign_card_styles":1,"quick_replies":3,"included_seats":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"maximo":{"assistant_replies":3000,"campaign_links":30,"campaign_card_styles":3,"quick_replies":50,"included_seats":1,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true}},"copy":{"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Página completa da casa, com foto de perfil, capa e informações","feature":null},{"text":"Rituais, jogos e serviços com pagamento pela plataforma","feature":null},{"text":"Publicações no feed e avaliações dos clientes","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Datas públicas na agenda da casa","feature":null}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"Lara, a assistente da casa, atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"Lara com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"}]}}}'::jsonb;
$$;

create or replace function public.plan_matrix_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text; nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  -- toda checagem trata ausência (null) como inválido: nenhuma combinação estranha passa por "null não é verdadeiro".
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['base', 'intermediario', 'maximo'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 13 then return false; end if;
    for k in select jsonb_object_keys(nums) loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'number' then return false; end if;
      if (v ->> k) !~ '^[0-9]{1,6}$' then return false; end if;
      if (v ->> k)::int < (nums -> k ->> 0)::int or (v ->> k)::int > (nums -> k ->> 1)::int then return false; end if;
    end loop;
    foreach k in array flags loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'boolean' then return false; end if;
    end loop;
    v := m -> 'copy' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if coalesce(jsonb_typeof(v -> 'tagline'), '') <> 'string' then return false; end if;
    if char_length(btrim(v ->> 'tagline')) not between 1 and 120 then return false; end if;
    if coalesce(jsonb_typeof(v -> 'benefits'), '') <> 'array' then return false; end if;
    if jsonb_array_length(v -> 'benefits') > 12 then return false; end if;
    for b in select jsonb_array_elements(v -> 'benefits') loop
      if coalesce(jsonb_typeof(b), '') <> 'object' then return false; end if;
      if coalesce(jsonb_typeof(b -> 'text'), '') <> 'string' then return false; end if;
      if char_length(btrim(b ->> 'text')) not between 1 and 200 then return false; end if;
      t := coalesce(jsonb_typeof(b -> 'feature'), 'null');
      if t = 'string' then
        if not ((b ->> 'feature') = any (feats)) then return false; end if;
      elsif t <> 'null' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- ============ 2) a matriz vira uma configuração do painel (com a mesma auditoria das outras) ============
alter table public.platform_settings drop constraint if exists platform_settings_key_check;

alter table public.platform_settings add constraint platform_settings_key_check
  check (key = any (array['features','pricing','scopes','payment_limits','referral','plan_matrix']));

insert into public.platform_settings (key, value) values ('plan_matrix', public.plan_matrix_default()) on conflict (key) do nothing;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare old_val jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_key not in ('features', 'pricing', 'scopes', 'payment_limits', 'referral', 'plan_matrix') then raise exception 'invalid_key'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
    raise exception 'invalid_value';
  end if;
  if p_key = 'payment_limits' then
    if jsonb_typeof(p_value -> 'max_cents') <> 'number'
       or (p_value ->> 'max_cents') !~ '^[0-9]+$'
       or (p_value ->> 'max_cents')::bigint not between 10000 and 10000000 then
      raise exception 'O teto por pagamento deve ficar entre R$ 100 e R$ 100.000.';
    end if;
  end if;
  if p_key = 'referral' then
    if (p_value ->> 'reward_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'reward_days')::int not between 1 and 90
       or (p_value ->> 'referred_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'referred_days')::int not between 0 and 90
       or (p_value ->> 'monthly_cap') !~ '^[0-9]{1,3}$' or (p_value ->> 'monthly_cap')::int not between 1 and 100 then
      raise exception 'Dias de prêmio entre 1 e 90, dias da casa indicada entre 0 e 90 e limite mensal entre 1 e 100.';
    end if;
  end if;
  if p_key = 'plan_matrix' and not public.plan_matrix_ok(p_value) then
    raise exception 'Matriz de planos inválida: confira os limites (números inteiros dentro da faixa) e os textos.';
  end if;
  select value into old_val from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), p_key, old_val, p_value);
end $$;

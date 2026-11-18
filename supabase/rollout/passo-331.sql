-- PASSO 331: 0162_momentos_das_casas — parte 1 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0162 — Momentos das casas (decisão do proprietário, 17/11/2026). Substitui o cartão "Momento indisponível" do protótipo.
-- Só as casas publicam (a partir do Essencial; vídeo de até 30 s só no Premium); o momento fica visível por 24 h e o arquivo é apagado do
-- armazenamento em 48 h (denúncia aberta, ou resolvida há menos de 90 dias, segura o arquivo como prova). Três denúncias de pessoas diferentes
-- escondem o momento até a administração decidir. Limites e vídeo vivem na matriz de planos (editáveis no painel).
-- 1) matriz de planos: moments_per_day (número) e moment_video (liga/desliga), com a matriz salva ganhando só o que falta.
-- 2) stories vira "momentos": colunas novas, trava no banco (plano, limite diário, arquivo da própria casa, vínculo com serviço/ritual).
-- 3) bucket "moments" (leitura pública, escrita só da própria casa e só com o plano).
-- 4) limpeza em 48 h pela rotina de arquivos que já existe (files_to_purge / files_purged), também para arquivos órfãos do bucket.
-- 5) denúncias, ocultação automática e fila da administração.
-- 6) moments_feed(): o carrossel do feed (casas que a pessoa segue primeiro).

-- ============ 1) matriz de planos ============
create or replace function public.plan_matrix_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text;
  nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20],"limit_services":[0,1000],"limit_rituals":[0,1000],"limit_posts_month":[0,1000],"moments_per_day":[0,50]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video','styled_posts','moment_video'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 19 then return false; end if;
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

create or replace function public.plan_matrix_default() returns jsonb
language sql immutable set search_path = public as $$
  select '{"caps":{"gratis":{"assistant_replies":0,"campaign_links":0,"campaign_card_styles":0,"quick_replies":0,"included_seats":0,"limit_services":3,"limit_rituals":2,"limit_posts_month":8,"moments_per_day":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":false,"moment_video":false},"base":{"assistant_replies":100,"campaign_links":0,"campaign_card_styles":0,"quick_replies":3,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":3,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":false,"moment_video":false},"intermediario":{"assistant_replies":500,"campaign_links":2,"campaign_card_styles":1,"quick_replies":10,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":5,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":true,"moment_video":false},"maximo":{"assistant_replies":1700,"campaign_links":30,"campaign_card_styles":3,"quick_replies":50,"included_seats":1,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":10,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true,"styled_posts":true,"moment_video":true}},"copy":{"gratis":{"tagline":"Comece a receber pessoas, sem mensalidade.","benefits":[{"text":"Página da casa, feed e avaliações dos clientes","feature":null},{"text":"Link e QR code da sua casa, para compartilhar onde quiser","feature":null},{"text":"Até {limit_services} serviços e {limit_rituals} rituais ativos, sempre com o pagamento da plataforma","feature":null},{"text":"Até {limit_posts_month} publicações por mês","feature":null},{"text":"Chat em texto","feature":null},{"text":"Assistente com pacote avulso de respostas, sem assinar nada","feature":null},{"text":"Impulsionamento e destaque quando quiser, pagando por dia","feature":null}]},"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Tudo do Grátis, sem limite de serviços, rituais e publicações","feature":null},{"text":"A assistente atende e vende (até {assistant_replies} respostas por mês)","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"Você escolhe vender pela plataforma ou combinar direto com o cliente","feature":null},{"text":"Datas públicas na agenda da casa","feature":null},{"text":"Momentos no topo do feed: até {moments_per_day} por dia, visíveis por 24 horas","feature":null}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com letras na sua identidade (fonte, cor e tamanho) e texto sempre legível","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"},{"text":"Momentos em vídeo de até 30 segundos, além das fotos (até {moments_per_day} por dia)","feature":null}]}}}'::jsonb;
$$;

do $$
declare v jsonb; p text; ben jsonb; t_base text := 'Momentos no topo do feed: até {moments_per_day} por dia, visíveis por 24 horas'; t_max text := 'Momentos em vídeo de até 30 segundos, além das fotos (até {moments_per_day} por dia)';
begin
  select value into v from public.platform_settings where key = 'plan_matrix';
  if v is null then return; end if;
  foreach p in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    if not ((v -> 'caps' -> p) ? 'moments_per_day') then
      v := jsonb_set(v, array['caps', p, 'moments_per_day'], to_jsonb(case p when 'base' then 3 when 'intermediario' then 5 when 'maximo' then 10 else 0 end));
    end if;
    if not ((v -> 'caps' -> p) ? 'moment_video') then
      v := jsonb_set(v, array['caps', p, 'moment_video'], to_jsonb(p = 'maximo'));
    end if;
  end loop;
  ben := v -> 'copy' -> 'base' -> 'benefits';
  if jsonb_typeof(ben) = 'array' and jsonb_array_length(ben) < 12 and not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' = t_base) then
    v := jsonb_set(v, '{copy,base,benefits}', ben || jsonb_build_array(jsonb_build_object('text', t_base, 'feature', null)));
  end if;
  ben := v -> 'copy' -> 'maximo' -> 'benefits';
  if jsonb_typeof(ben) = 'array' and jsonb_array_length(ben) < 12 and not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' = t_max) then
    v := jsonb_set(v, '{copy,maximo,benefits}', ben || jsonb_build_array(jsonb_build_object('text', t_max, 'feature', null)));
  end if;
  if public.plan_matrix_ok(v) then
    update public.platform_settings set value = v, updated_at = now() where key = 'plan_matrix';
  end if;
end
$$;

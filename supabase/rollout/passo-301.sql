-- PASSO 301: 0140_posts_com_a_cara_da_casa — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0140 — Posts com a cara da sua casa (Profissional e Premium). Pedido do proprietário, 16/11/2026.
-- A casa publica com uma foto (do templo, do altar...) em 3 modos: normal (como hoje), imagem cobrindo o card inteiro (com efeito atrás das letras
-- para o texto ficar legível) ou imagem em parte do card; vê o resultado antes de publicar. O card é desenhado na tela (o texto continua texto).
-- 1) a ferramenta entra na matriz de planos como liga/desliga (styled_posts): Profissional e Premium; o proprietário muda no painel.
-- 2) posts ganha card_style ('total' | 'parcial'; vazio = normal) e a confirmação de direito de uso da imagem; o banco recusa estilizar sem o plano,
--    sem imagem da própria casa, com texto longo demais ou sem a confirmação.
-- 3) foto de post: bucket post-images (público para leitura, escrita só do dono da casa, só com o plano). Imagem de post só vale se vier desse bucket,
--    da pasta do próprio dono (fecha a brecha de apontar para qualquer endereço da internet).

-- ============ 1) matriz de planos ============
create or replace function public.plan_matrix_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text;
  nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20],"limit_services":[0,1000],"limit_rituals":[0,1000],"limit_posts_month":[0,1000]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video','styled_posts'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 17 then return false; end if;
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
  select '{"caps":{"base":{"chat_media":false,"members_area":false,"ritual_video":false,"calendar_full":false,"limit_rituals":0,"quick_replies":3,"campaign_links":0,"included_seats":0,"limit_services":0,"assistant_sells":true,"assistant_replies":100,"limit_posts_month":0,"assistant_discount":false,"campaign_card_styles":0,"campaign_daily_count":false,"campaign_insights_full":false,"styled_posts":false},"gratis":{"chat_media":false,"members_area":false,"ritual_video":false,"calendar_full":false,"limit_rituals":2,"quick_replies":0,"campaign_links":0,"included_seats":0,"limit_services":3,"assistant_sells":true,"assistant_replies":0,"limit_posts_month":8,"assistant_discount":false,"campaign_card_styles":0,"campaign_daily_count":false,"campaign_insights_full":false,"styled_posts":false},"maximo":{"chat_media":true,"members_area":true,"ritual_video":true,"calendar_full":true,"limit_rituals":0,"quick_replies":50,"campaign_links":30,"included_seats":1,"limit_services":0,"assistant_sells":true,"assistant_replies":1700,"limit_posts_month":0,"assistant_discount":true,"campaign_card_styles":3,"campaign_daily_count":true,"campaign_insights_full":true,"styled_posts":true},"intermediario":{"chat_media":false,"members_area":false,"ritual_video":false,"calendar_full":false,"limit_rituals":0,"quick_replies":10,"campaign_links":2,"included_seats":0,"limit_services":0,"assistant_sells":true,"assistant_replies":500,"limit_posts_month":0,"assistant_discount":false,"campaign_card_styles":1,"campaign_daily_count":false,"campaign_insights_full":false,"styled_posts":true}},"copy":{"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Tudo do Grátis, sem limite de serviços, rituais e publicações","feature":null},{"text":"A assistente atende e vende (até {assistant_replies} respostas por mês)","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"Você escolhe vender pela plataforma ou combinar direto com o cliente","feature":null},{"text":"Datas públicas na agenda da casa","feature":null}]},"gratis":{"tagline":"Comece a receber pessoas, sem mensalidade.","benefits":[{"text":"Página da casa, feed e avaliações dos clientes","feature":null},{"text":"Link e QR code da sua casa, para compartilhar onde quiser","feature":null},{"text":"Até {limit_services} serviços e {limit_rituals} rituais ativos, sempre com o pagamento da plataforma","feature":null},{"text":"Até {limit_posts_month} publicações por mês","feature":null},{"text":"Chat em texto","feature":null},{"text":"Assistente com pacote avulso de respostas, sem assinar nada","feature":null},{"text":"Impulsionamento e destaque quando quiser, pagando por dia","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com o texto sempre legível","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]}}}'::jsonb;
$$;

-- A matriz salva ganha a ferramenta sem perder edições feitas no painel (só acrescenta o que falta).
do $$
declare v jsonb; p text; ben jsonb; pos int;
begin
  select value into v from public.platform_settings where key = 'plan_matrix';
  if v is null then return; end if;
  foreach p in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    if not ((v -> 'caps' -> p) ? 'styled_posts') then
      v := jsonb_set(v, array['caps', p, 'styled_posts'], to_jsonb(p in ('intermediario', 'maximo')));
    end if;
  end loop;
  ben := v -> 'copy' -> 'intermediario' -> 'benefits';
  if jsonb_typeof(ben) = 'array' and jsonb_array_length(ben) < 12
     and not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' ilike '%Posts com a cara da sua casa%') then
    pos := least(4, jsonb_array_length(ben));
    v := jsonb_set(v, '{copy,intermediario,benefits}',
      coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(ben) with ordinality t(e, o) where o <= pos), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('text', 'Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com o texto sempre legível', 'feature', null))
      || coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(ben) with ordinality t(e, o) where o > pos), '[]'::jsonb));
  end if;
  if public.plan_matrix_ok(v) then
    update public.platform_settings set value = v, updated_at = now() where key = 'plan_matrix';
  end if;
end
$$;

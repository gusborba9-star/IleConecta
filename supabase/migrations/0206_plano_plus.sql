-- 0206 — Plano Plus, parte 2 (decisão do proprietário, 24/11/2026): o vídeo (reuniões e consultas) é exclusivo do Plus.
-- O Plus nasce SEM PREÇO e fora da venda: sem mensalidade na tabela, a contratação já é recusada ("Este plano não tem mensalidade na tabela").
-- Só a administração atribui o Plus a casas piloto. Mensagens da assistente, minutos de vídeo e acessos de equipe abaixo são valores PROVISÓRIOS
-- (o dono decide os finais pelo painel). Regra nova na matriz: minutos de vídeo só podem ser maiores que zero no Plus.
-- Nada muda para quem já tem plano: os outros planos continuam idênticos.

create or replace function public.platform_plan_rank(p text) returns integer language sql immutable set search_path = public as $$
select case p when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 when 'plus' then 4 end;
$$;

create or replace function public.log_house_plan_change() returns trigger language plpgsql security definer set search_path = public as $$
declare ro int; rn int; v_reason text;
begin
  if tg_op = 'INSERT' then
    insert into public.house_plan_history (house_id, from_plan, to_plan, reason) values (new.id, null, new.plan::text, 'inicio');
    return new;
  end if;
  if new.plan is not distinct from old.plan then return new; end if;
  ro := case old.plan::text when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 when 'plus' then 4 else 1 end;
  rn := case new.plan::text when 'gratis' then 0 when 'base' then 1 when 'intermediario' then 2 when 'maximo' then 3 when 'plus' then 4 else 1 end;
  v_reason := case
    when auth.uid() is not null and public.is_admin() then 'admin'
    when old.plan_revert_at is not null and new.plan_revert_at is null and new.plan is not distinct from old.plan_revert_to then 'admin'
    when new.plan::text = 'gratis' then 'cancelou'
    when rn > ro then 'subiu'
    else 'rebaixou' end;
  insert into public.house_plan_history (house_id, from_plan, to_plan, reason) values (new.id, old.plan::text, new.plan::text, v_reason);
  return new;
end $$;

-- matriz de planos: valores iniciais com o Plus e regra do vídeo
create or replace function public.plan_matrix_default() returns jsonb language sql immutable set search_path = public as $$
  select '{"caps":{"gratis":{"assistant_replies":0,"campaign_links":0,"campaign_card_styles":0,"quick_replies":0,"included_seats":0,"limit_services":3,"limit_rituals":2,"limit_posts_month":8,"moments_per_day":0,"video_minutes_month":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":false,"moment_video":false},"base":{"assistant_replies":100,"campaign_links":0,"campaign_card_styles":0,"quick_replies":3,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":3,"video_minutes_month":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":false,"moment_video":false},"intermediario":{"assistant_replies":500,"campaign_links":2,"campaign_card_styles":1,"quick_replies":10,"included_seats":0,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":5,"video_minutes_month":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false,"styled_posts":true,"moment_video":false},"maximo":{"assistant_replies":1700,"campaign_links":30,"campaign_card_styles":3,"quick_replies":50,"included_seats":1,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":10,"video_minutes_month":0,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true,"styled_posts":true,"moment_video":true},"plus":{"assistant_replies":3400,"campaign_links":60,"campaign_card_styles":3,"quick_replies":100,"included_seats":3,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":20,"video_minutes_month":3000,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true,"styled_posts":true,"moment_video":true}},"copy":{"gratis":{"tagline":"Comece a receber pessoas, sem mensalidade.","benefits":[{"text":"Página da casa, feed e avaliações dos clientes","feature":null},{"text":"Link e QR code da sua casa, para compartilhar onde quiser","feature":null},{"text":"Até {limit_services} serviços e {limit_rituals} rituais ativos, sempre com o pagamento da plataforma","feature":null},{"text":"Até {limit_posts_month} publicações por mês","feature":null},{"text":"Chat em texto","feature":null},{"text":"Assistente com pacote avulso de respostas, sem assinar nada","feature":null},{"text":"Impulsionamento e destaque quando quiser, pagando por dia","feature":null}]},"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Tudo do Grátis, sem limite de serviços, rituais e publicações","feature":null},{"text":"A assistente atende e vende (até {assistant_replies} respostas por mês)","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"Você escolhe vender pela plataforma ou combinar direto com o cliente","feature":null},{"text":"Datas públicas na agenda da casa","feature":null},{"text":"Momentos no topo do feed: até {moments_per_day} por dia, visíveis por 24 horas","feature":null}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com letras na sua identidade (fonte, cor e tamanho) e texto sempre legível","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"},{"text":"Momentos em vídeo de até 30 segundos, além das fotos (até {moments_per_day} por dia)","feature":null}]},"plus":{"tagline":"A casa completa, com vídeo e atendimento ampliado.","benefits":[{"text":"Tudo do Premium","feature":null},{"text":"Reuniões por vídeo com os membros e consultas individuais por vídeo, com até {video_minutes_month} minutos por mês","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês","feature":null},{"text":"Até {campaign_links} links de divulgação e {quick_replies} respostas rápidas","feature":null},{"text":"{included_seats} acessos de equipe inclusos","feature":null},{"text":"Momentos em foto e vídeo (até {moments_per_day} por dia)","feature":null}]}}}'::jsonb;
$$;

create or replace function public.plan_matrix_ok(m jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text;
  nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20],"limit_services":[0,1000],"limit_rituals":[0,1000],"limit_posts_month":[0,1000],"moments_per_day":[0,50],"video_minutes_month":[0,100000]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video','styled_posts','moment_video'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['gratis', 'base', 'intermediario', 'maximo', 'plus'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 20 then return false; end if;
    for k in select jsonb_object_keys(nums) loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'number' then return false; end if;
      if (v ->> k) !~ '^[0-9]{1,6}$' then return false; end if;
      if (v ->> k)::int < (nums -> k ->> 0)::int or (v ->> k)::int > (nums -> k ->> 1)::int then return false; end if;
    end loop;
    -- o vídeo é exclusivo do Plus
    if plan <> 'plus' and (v ->> 'video_minutes_month')::int <> 0 then return false; end if;
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

-- preços de cobrança: acesso extra de equipe também no Plus (valor provisório igual ao do Premium)
create or replace function public.billing_prices_default() returns jsonb language sql immutable set search_path = public as $$
select '{"extra_seat":{"base":2990,"intermediario":3990,"maximo":3990,"plus":3990},"credit_pack":{"p80":1990,"p200":4990,"p500":8990},"highlight":null,"boost":null}'::jsonb;
$$;

create or replace function public.billing_prices_ok(m jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare k text; g text; v jsonb;
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a) is distinct from array['boost','credit_pack','extra_seat','highlight'] then return false; end if;
foreach k in array array['extra_seat','credit_pack'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from (case k when 'extra_seat' then array['base','intermediario','maximo','plus'] else array['p200','p500','p80'] end) then return false; end if;
for g in select jsonb_object_keys(v) loop
if coalesce(jsonb_typeof(v -> g), '') <> 'number' or (v ->> g) !~ '^[0-9]{1,7}$' or (v ->> g)::bigint not between 100 and 1000000 then return false; end if;
end loop;
end loop;
foreach k in array array['highlight','boost'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), 'null') = 'null' then continue; end if;
if jsonb_typeof(v) <> 'number' or (m ->> k) !~ '^[0-9]{1,7}$' or (m ->> k)::bigint not between 100 and 1000000 then return false; end if;
end loop;
return true;
end $$;

-- reajuste anunciado: aceita o Plus (só funciona depois que ele tiver mensalidade)
alter table public.platform_price_changes drop constraint if exists platform_price_changes_plan_check;
alter table public.platform_price_changes add constraint platform_price_changes_plan_check check (plan = any (array['base','intermediario','maximo','plus']));

-- demais funções de plano: a lista de planos aceitos ganha o Plus. A troca é feita sobre a definição que está no banco, com conferência
-- (se alguma troca não achar o trecho, a migração inteira falha e nada é gravado).
do $mig$
declare r record; d text; n text;
begin
  for r in select * from (values
    ('platform_subscribe_issue', '(''base'', ''intermediario'', ''maximo'')', '(''base'', ''intermediario'', ''maximo'', ''plus'')'),
    ('platform_reactivation_issue', '(''base'', ''intermediario'', ''maximo'')', '(''base'', ''intermediario'', ''maximo'', ''plus'')'),
    ('platform_house_subscribed_by_payment', '(''base'', ''intermediario'', ''maximo'')', '(''base'', ''intermediario'', ''maximo'', ''plus'')'),
    ('platform_house_reactivated_by_payment', '(''base'', ''intermediario'', ''maximo'')', '(''base'', ''intermediario'', ''maximo'', ''plus'')'),
    ('admin_price_announce', '(''base'', ''intermediario'', ''maximo'')', '(''base'', ''intermediario'', ''maximo'', ''plus'')'),
    ('platform_house_upgraded_by_payment', '(''intermediario'', ''maximo'')', '(''intermediario'', ''maximo'', ''plus'')'),
    ('platform_upgrade_quote', '(''intermediario'', ''maximo'')', '(''intermediario'', ''maximo'', ''plus'')'),
    ('my_plan_change_status', 'array[''intermediario'', ''maximo'']', 'array[''intermediario'', ''maximo'', ''plus'']'),
    ('my_plan_change_schedule', '(''gratis'', ''base'', ''intermediario'')', '(''gratis'', ''base'', ''intermediario'', ''maximo'')')
  ) as t(fn, old_txt, new_txt) loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn;
    if d is null then raise exception 'Função % não encontrada', r.fn; end if;
    n := replace(d, r.old_txt, r.new_txt);
    if n = d then raise exception 'Trecho não encontrado em %', r.fn; end if;
    execute n;
  end loop;
end $mig$;

-- dados: o Plus entra na matriz, nos preços de cobrança e na tabela de preços (SEM mensalidade)
update public.platform_settings set value = jsonb_set(jsonb_set(value, '{caps,plus}', '{"assistant_replies":3400,"campaign_links":60,"campaign_card_styles":3,"quick_replies":100,"included_seats":3,"limit_services":0,"limit_rituals":0,"limit_posts_month":0,"moments_per_day":20,"video_minutes_month":3000,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true,"styled_posts":true,"moment_video":true}'::jsonb), '{copy,plus}', '{"tagline":"A casa completa, com vídeo e atendimento ampliado.","benefits":[{"text":"Tudo do Premium","feature":null},{"text":"Reuniões por vídeo com os membros e consultas individuais por vídeo, com até {video_minutes_month} minutos por mês","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês","feature":null},{"text":"Até {campaign_links} links de divulgação e {quick_replies} respostas rápidas","feature":null},{"text":"{included_seats} acessos de equipe inclusos","feature":null},{"text":"Momentos em foto e vídeo (até {moments_per_day} por dia)","feature":null}]}'::jsonb), updated_at = now()
 where key = 'plan_matrix' and not (value -> 'caps' ? 'plus');
update public.platform_settings set value = jsonb_set(value, '{extra_seat,plus}', '3990'::jsonb), updated_at = now()
 where key = 'billing_prices' and not (value -> 'extra_seat' ? 'plus');
update public.platform_settings set value = jsonb_set(value, '{plans,plus}', '{"name":"Plus","monthly":null}'::jsonb), updated_at = now()
 where key = 'pricing' and not (value -> 'plans' ? 'plus');

do $chk$
begin
  if not public.plan_matrix_ok((select value from public.platform_settings where key = 'plan_matrix')) then raise exception 'Matriz de planos ficou inválida.'; end if;
  if not public.billing_prices_ok((select value from public.platform_settings where key = 'billing_prices')) then raise exception 'Preços de cobrança ficaram inválidos.'; end if;
  if not public.plan_matrix_ok(public.plan_matrix_default()) then raise exception 'Matriz padrão inválida.'; end if;
end $chk$;

-- 0142 — Letras com a sua identidade (pedido do proprietário, 17/11/2026). Parte dos Posts com a cara da sua casa (Profissional e Premium).
-- A casa escolhe fonte, tamanho, cor, alinhamento, posição do texto, negrito e itálico, vendo a prévia antes de publicar.
-- O banco guarda só a ESCOLHA, de uma lista fechada (nunca estilo escrito à mão: ninguém injeta nada). Regras de leitura valem aqui também:
-- sobre a foto (card todo) só cores claras; sobre o papel do card (foto em cima) só cores escuras; posição do texto só existe no card todo.
-- Letras só existem em post estilizado (com imagem da própria casa) e seguem a mesma trava de plano da 0140.

-- 1) colunas e listas fechadas
alter table public.posts add column if not exists card_font text;

alter table public.posts add column if not exists card_size text;

alter table public.posts add column if not exists card_color text;

alter table public.posts add column if not exists card_align text;

alter table public.posts add column if not exists card_pos text;

alter table public.posts add column if not exists card_bold boolean not null default false;

alter table public.posts add column if not exists card_italic boolean not null default false;

alter table public.posts drop constraint if exists posts_card_letters_ok;

alter table public.posts add constraint posts_card_letters_ok check (
  (card_font is null or card_font in ('classica', 'moderna', 'elegante', 'manuscrita', 'ritual'))
  and (card_size is null or card_size in ('p', 'm', 'g'))
  and (card_color is null or card_color in ('branco', 'creme', 'dourado', 'rosa', 'verdeclaro', 'azulclaro', 'preto', 'floresta', 'vinho', 'marrom', 'marinho', 'roxo'))
  and (card_align is null or card_align in ('esq', 'centro', 'dir'))
  and (card_pos is null or card_pos in ('topo', 'meio', 'base'))
);

-- 2) guarda do banco (substitui a da 0140: mesmas regras + as das letras)
create or replace function public.posts_styled_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text; v_letters boolean; v_changed boolean;
begin
  select h.owner_id, h.plan::text into v_owner, v_plan from public.houses h where h.id = new.house_id;
  if v_owner is null then return new; end if;
  -- publicação real não aponta para endereço de fora: a única imagem possível é a enviada pela plataforma (card_image_path)
  if new.image_url is not null and (tg_op = 'INSERT' or new.image_url is distinct from old.image_url) then
    raise exception 'Posts com a cara da sua casa: a imagem precisa ser enviada pela própria plataforma.';
  end if;
  v_letters := new.card_font is not null or new.card_size is not null or new.card_color is not null or new.card_align is not null
               or new.card_pos is not null or new.card_bold or new.card_italic;
  if new.card_style is null then
    if new.card_image_path is not null and (tg_op = 'INSERT' or new.card_image_path is distinct from old.card_image_path) then
      raise exception 'Posts com a cara da sua casa: escolha o estilo do card para usar uma imagem.';
    end if;
    if v_letters then raise exception 'Letras com a sua identidade: valem só no post com imagem no card.'; end if;
    new.card_rights_ack := false;
    return new;
  end if;
  v_changed := tg_op = 'UPDATE' and (new.card_font is distinct from old.card_font or new.card_size is distinct from old.card_size
               or new.card_color is distinct from old.card_color or new.card_align is distinct from old.card_align
               or new.card_pos is distinct from old.card_pos or new.card_bold is distinct from old.card_bold or new.card_italic is distinct from old.card_italic);
  if tg_op = 'INSERT' or new.card_style is distinct from old.card_style or (v_letters and v_changed) then
    if not public.plan_cap_bool(v_plan, 'styled_posts') then
      raise exception 'Posts com a cara da sua casa estão disponíveis a partir do plano Profissional.';
    end if;
  end if;
  if new.card_image_path is null then raise exception 'Posts com a cara da sua casa: escolha a imagem do card.'; end if;
  if tg_op = 'INSERT' or new.card_image_path is distinct from old.card_image_path then
    if new.card_image_path !~ ('^' || v_owner::text || '/[A-Za-z0-9._-]+$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'post-images' and o.name = new.card_image_path) then
      raise exception 'Posts com a cara da sua casa: a imagem precisa ser enviada pela própria plataforma.';
    end if;
  end if;
  if char_length(new.content) > 400 then raise exception 'Posts com a cara da sua casa: no card o texto pode ter até 400 caracteres.'; end if;
  if new.card_rights_ack is not true then raise exception 'Posts com a cara da sua casa: confirme que você tem o direito de usar a imagem.'; end if;
  -- letras: cor clara sobre a foto, cor escura sobre o papel; posição só no card todo
  if new.card_style = 'total' and new.card_color is not null and new.card_color not in ('branco', 'creme', 'dourado', 'rosa', 'verdeclaro', 'azulclaro') then
    raise exception 'Letras com a sua identidade: sobre a foto use uma cor clara.';
  end if;
  if new.card_style = 'parcial' and new.card_color is not null and new.card_color not in ('preto', 'floresta', 'vinho', 'marrom', 'marinho', 'roxo') then
    raise exception 'Letras com a sua identidade: sobre o papel do card use uma cor escura.';
  end if;
  if new.card_style = 'parcial' and new.card_pos is not null then
    raise exception 'Letras com a sua identidade: a posição do texto vale só para a imagem no card todo.';
  end if;
  return new;
end $$;

revoke execute on function public.posts_styled_guard() from public, anon, authenticated;

drop trigger if exists posts_styled_guard on public.posts;

create trigger posts_styled_guard before insert or update of card_style, card_image_path, image_url, content, card_rights_ack, card_font, card_size, card_color, card_align, card_pos, card_bold, card_italic on public.posts
  for each row execute function public.posts_styled_guard();

-- 3) o benefício do plano Profissional passa a falar das letras
create or replace function public.plan_matrix_default() returns jsonb
language sql immutable set search_path = public as $$
  select '{"caps":{"base":{"chat_media":false,"members_area":false,"ritual_video":false,"calendar_full":false,"limit_rituals":0,"quick_replies":3,"campaign_links":0,"included_seats":0,"limit_services":0,"assistant_sells":true,"assistant_replies":100,"limit_posts_month":0,"assistant_discount":false,"campaign_card_styles":0,"campaign_daily_count":false,"campaign_insights_full":false,"styled_posts":false},"gratis":{"chat_media":false,"members_area":false,"ritual_video":false,"calendar_full":false,"limit_rituals":2,"quick_replies":0,"campaign_links":0,"included_seats":0,"limit_services":3,"assistant_sells":true,"assistant_replies":0,"limit_posts_month":8,"assistant_discount":false,"campaign_card_styles":0,"campaign_daily_count":false,"campaign_insights_full":false,"styled_posts":false},"maximo":{"chat_media":true,"members_area":true,"ritual_video":true,"calendar_full":true,"limit_rituals":0,"quick_replies":50,"campaign_links":30,"included_seats":1,"limit_services":0,"assistant_sells":true,"assistant_replies":1700,"limit_posts_month":0,"assistant_discount":true,"campaign_card_styles":3,"campaign_daily_count":true,"campaign_insights_full":true,"styled_posts":true},"intermediario":{"chat_media":false,"members_area":false,"ritual_video":false,"calendar_full":false,"limit_rituals":0,"quick_replies":10,"campaign_links":2,"included_seats":0,"limit_services":0,"assistant_sells":true,"assistant_replies":500,"limit_posts_month":0,"assistant_discount":false,"campaign_card_styles":1,"campaign_daily_count":false,"campaign_insights_full":false,"styled_posts":true}},"copy":{"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Tudo do Grátis, sem limite de serviços, rituais e publicações","feature":null},{"text":"A assistente atende e vende (até {assistant_replies} respostas por mês)","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"Você escolhe vender pela plataforma ou combinar direto com o cliente","feature":null},{"text":"Datas públicas na agenda da casa","feature":null}]},"gratis":{"tagline":"Comece a receber pessoas, sem mensalidade.","benefits":[{"text":"Página da casa, feed e avaliações dos clientes","feature":null},{"text":"Link e QR code da sua casa, para compartilhar onde quiser","feature":null},{"text":"Até {limit_services} serviços e {limit_rituals} rituais ativos, sempre com o pagamento da plataforma","feature":null},{"text":"Até {limit_posts_month} publicações por mês","feature":null},{"text":"Chat em texto","feature":null},{"text":"Assistente com pacote avulso de respostas, sem assinar nada","feature":null},{"text":"Impulsionamento e destaque quando quiser, pagando por dia","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com letras na sua identidade (fonte, cor e tamanho) e texto sempre legível","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]}}}'::jsonb;
$$;

-- A matriz salva troca o texto antigo pelo novo só se o proprietário não tiver mexido nele (edição dele vale mais).
do $$
declare v jsonb; ben jsonb; old_t text := 'Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com o texto sempre legível'; new_t text := 'Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com letras na sua identidade (fonte, cor e tamanho) e texto sempre legível';
begin
  select value into v from public.platform_settings where key = 'plan_matrix';
  if v is null then return; end if;
  ben := v -> 'copy' -> 'intermediario' -> 'benefits';
  if jsonb_typeof(ben) <> 'array' or not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' = old_t) then return; end if;
  v := jsonb_set(v, '{copy,intermediario,benefits}',
    (select jsonb_agg(case when e ->> 'text' = old_t then jsonb_set(e, '{text}', to_jsonb(new_t)) else e end order by o) from jsonb_array_elements(ben) with ordinality t(e, o)));
  if public.plan_matrix_ok(v) then
    update public.platform_settings set value = v, updated_at = now() where key = 'plan_matrix';
  end if;
end
$$;

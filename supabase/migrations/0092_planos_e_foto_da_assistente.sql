-- Fase 4: alinhamento da página de planos. (1) O nome "Lara" era só de teste: a casa escolhe o nome da assistente (assistants.display_name, padrão "Assistente"), então os textos dos planos
-- falam "a assistente da casa". (2) Foto opcional da assistente, só para casas em plano com assistente: o arquivo fica na pasta da própria dona (bucket avatars) e só o caminho é guardado.
-- Estado de produção antes desta migration: nenhuma casa tem foto de assistente; a matriz salva no painel ainda traz "Lara" nos textos dos planos Profissional e Premium.

-- ============ 1) textos dos planos sem o nome de teste ============
create or replace function public.plan_matrix_default() returns jsonb
language sql immutable set search_path = public as $$
  select '{"caps":{"base":{"assistant_replies":0,"campaign_links":0,"campaign_card_styles":0,"quick_replies":0,"included_seats":0,"assistant_sells":false,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"intermediario":{"assistant_replies":300,"campaign_links":2,"campaign_card_styles":1,"quick_replies":3,"included_seats":0,"assistant_sells":true,"assistant_discount":false,"chat_media":false,"members_area":false,"calendar_full":false,"campaign_daily_count":false,"campaign_insights_full":false,"ritual_video":false},"maximo":{"assistant_replies":3000,"campaign_links":30,"campaign_card_styles":3,"quick_replies":50,"included_seats":1,"assistant_sells":true,"assistant_discount":true,"chat_media":true,"members_area":true,"calendar_full":true,"campaign_daily_count":true,"campaign_insights_full":true,"ritual_video":true}},"copy":{"base":{"tagline":"Tudo para a sua casa receber pessoas.","benefits":[{"text":"Página completa da casa, com foto de perfil, capa e informações","feature":null},{"text":"Rituais, jogos e serviços com pagamento pela plataforma","feature":null},{"text":"Publicações no feed e avaliações dos clientes","feature":null},{"text":"Chat com texto e PDF","feature":null},{"text":"Datas públicas na agenda da casa","feature":null}]},"intermediario":{"tagline":"A casa atendendo a qualquer hora.","benefits":[{"text":"Tudo do Essencial","feature":null},{"text":"A assistente da casa atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda","feature":null},{"text":"Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes","feature":null},{"text":"Passa para você os assuntos delicados, com aviso no sino","feature":null},{"text":"Catálogo interno e relatório do atendimento","feature":null},{"text":"Até {campaign_links} links de divulgação, com QR code e modo discreto","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null}]},"maximo":{"tagline":"A casa completa, com a comunidade por perto.","benefits":[{"text":"Tudo do Profissional","feature":null},{"text":"A assistente com até {assistant_replies} respostas por mês e descontos definidos pela casa","feature":null},{"text":"Área de membros e mensalidades, sem planilha","feature":null},{"text":"Calendário completo: cada data para o público certo e repetição anual","feature":null},{"text":"Fotos e vídeos curtos no chat com os clientes","feature":null},{"text":"Até {campaign_links} links de divulgação, com contagem dia a dia","feature":null},{"text":"Até {quick_replies} respostas rápidas para o chat","feature":null},{"text":"{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa","feature":null},{"text":"Vídeo de 30 segundos nos registros dos rituais","feature":"ritual_video"}]}}}'::jsonb;
$$;

-- A matriz já salva no painel: troca só as duas frases originais (se o proprietário já editou o texto, nada é sobrescrito)
update public.platform_settings
set value = replace(replace(value::text, 'Lara, a assistente da casa, atende 24h', 'A assistente da casa atende 24h'), 'Lara com até', 'A assistente com até')::jsonb, updated_at = now()
where key = 'plan_matrix' and value::text like '%Lara%' and public.plan_matrix_ok(replace(replace(value::text, 'Lara, a assistente da casa, atende 24h', 'A assistente da casa atende 24h'), 'Lara com até', 'A assistente com até')::jsonb);

-- ============ 2) foto da assistente ============
alter table public.assistants add column if not exists avatar_path text;

alter table public.assistants drop constraint if exists assistants_avatar_path_check;

alter table public.assistants add constraint assistants_avatar_path_check check (avatar_path is null or avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/assistant-[0-9]{10,14}\.(webp|jpg)$');

-- a foto precisa estar na pasta da dona da casa, e só casa com plano que inclui a assistente pode ter foto
create or replace function public.assistants_avatar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text;
begin
if new.avatar_path is null then return new; end if;
if tg_op = 'UPDATE' and new.avatar_path is not distinct from old.avatar_path then return new; end if;
select owner_id, plan::text into v_owner, v_plan from public.houses where id = new.house_id;
if v_owner is null or split_part(new.avatar_path, '/', 1) <> v_owner::text then raise exception 'A foto da assistente precisa ser da própria casa.'; end if;
if public.assistant_monthly_limit(v_plan) <= 0 then raise exception 'O plano da casa não inclui a assistente.'; end if;
return new;
end $$;

drop trigger if exists trg_assistants_avatar_guard on public.assistants;

create trigger trg_assistants_avatar_guard before insert or update on public.assistants
for each row execute function public.assistants_avatar_guard();

-- o cliente vê a foto só se a assistente está ativa e o plano da casa ainda inclui a assistente
create or replace function public.assistant_avatar_path(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select a.avatar_path from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and a.avatar_path is not null and public.assistant_monthly_limit(h.plan::text) > 0;
$$;

-- ============ 3) permissões ============
revoke all on function public.assistants_avatar_guard(), public.assistant_avatar_path(uuid) from public, anon, authenticated;

grant execute on function public.assistant_avatar_path(uuid) to authenticated;

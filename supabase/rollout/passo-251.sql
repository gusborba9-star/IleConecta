-- PASSO 251: 0121_moderacao_fase2 — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0121 — Moderação, fase 2: promessas garantidas vão para uma fila da administração (nada é recusado na hora).
-- Fluxo (decisão do proprietário + advogado, 15/11/2026): a administração orienta (educativo, durante o período de adaptação de 30 dias),
-- depois advertência oficial com prazo de 72 horas (15 dias para contato externo em conteúdo antigo); sem correção no prazo, só aquele
-- anúncio é ocultado até a correção; a casa pode contestar em 7 dias corridos. Nunca olha o chat.

-- ============ 1) Detector de promessa garantida (puro; só sinaliza, nunca recusa)
create or replace function public.promise_in_text(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
declare t text := lower(coalesce(p_text, ''));
begin
  if t = '' then return false; end if;
  if t ~ '(garant\w*[^.!?]{0,40}(resultado|retorno|sucesso|amor|cura|vit[oó]ria|efic|funcion))|((resultado|retorno|sucesso|amor|cura|vit[oó]ria|efic\w*|funcion\w*)[^.!?]{0,40}garant\w*)' then return true; end if;
  if t ~ '100 ?(%|por ?cento)[^.!?]{0,30}(garant|cert|efic|sucesso|resultado|funcion)' then return true; end if;
  if t ~ '((em|at[eé]|dentro de)[ ]+[0-9]+[ ]+(dias?|horas?|semanas?)[^.!?]{0,40}(resultado|retorno|volta|traz|trago|resolv|cura|amor|sucesso))|((trago|traz|volta|resolv\w*|cura\w*|amarr\w*|garant\w*)[^.!?]{0,40}(em|at[eé]|dentro de)[ ]+[0-9]+[ ]+(dias?|horas?|semanas?))' then return true; end if;
  if t ~ '(amarra\w*[^.!?]{0,20}garant|garant\w*[^.!?]{0,20}amarra)' then return true; end if;
  if t ~ '(nunca falha|sem falhas?|n[aã]o falha|resultado certo|resultado imediato|efic[aá]cia comprovada)' then return true; end if;
  return false;
end $$;

revoke all on function public.promise_in_text(text) from public, anon, authenticated;

-- ============ 2) Ocultação por moderação (só a administração mexe)
alter table public.services add column if not exists moderation_hidden boolean not null default false;

alter table public.events add column if not exists moderation_hidden boolean not null default false;

alter table public.posts add column if not exists moderation_hidden boolean not null default false;

drop policy if exists services_read on public.services;

create policy services_read on public.services for select using ((active and listed and not moderation_hidden) or is_house_owner(house_id));

drop policy if exists events_read on public.events;

create policy events_read on public.events for select using ((status = any (array['publicado'::event_status, 'encerrado'::event_status]) and not moderation_hidden) or is_house_owner(house_id));

drop policy if exists posts_read on public.posts;

create policy posts_read on public.posts for select using (not moderation_hidden or is_house_owner(house_id));

create or replace function public.moderation_hidden_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.moderation', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then new.moderation_hidden := false;
  else new.moderation_hidden := old.moderation_hidden; end if;
  return new;
end $$;

revoke all on function public.moderation_hidden_guard() from public, anon, authenticated;

drop trigger if exists trg_moderation_hidden on public.services;

create trigger trg_moderation_hidden before insert or update on public.services for each row execute function public.moderation_hidden_guard();

drop trigger if exists trg_moderation_hidden on public.events;

create trigger trg_moderation_hidden before insert or update on public.events for each row execute function public.moderation_hidden_guard();

drop trigger if exists trg_moderation_hidden on public.posts;

create trigger trg_moderation_hidden before insert or update on public.posts for each row execute function public.moderation_hidden_guard();

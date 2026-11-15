-- PASSO 250: 0120_moderacao_fase1_contato_externo — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0120 — Moderação, fase 1: no plano Grátis, contato externo (telefone, link, e-mail, @ de rede social) é recusado na hora.
-- Decisão do proprietário e orientação do advogado (15/11/2026): vale em todo conteúdo público da casa (nome, bio, ofertas, títulos e
-- descrições de serviços e rituais, publicações e comentários), nunca no chat. Planos pagos não têm a regra. O banco é a autoridade
-- (a tela só mostra o motivo). Conteúdo já publicado não é apagado: a regra só barra o que for salvo ou editado daqui para frente.

-- ============ 1) Detector (puro): há telefone, link, e-mail ou @ de rede social no texto?
create or replace function public.contact_in_text(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
declare t text := coalesce(p_text, '');
begin
  if t = '' then return false; end if;
  -- e-mail
  if t ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' then return true; end if;
  -- link: com protocolo, www., ou domínio com terminação comum / de rede social e mensageria
  if t ~* '(https?://|www\.)\S+' then return true; end if;
  if t ~* '(^|[^a-z0-9@.-])(wa\.me|t\.me|bit\.ly|linktr\.ee|instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|chat\.whatsapp\.com)(/|\s|$|[.,;:!?)])' then return true; end if;
  if t ~* '(^|[^a-z0-9@.-])[a-z0-9][a-z0-9-]{1,}(\.[a-z0-9-]{2,})*\.(com|net|org|info|app|site|online|store|link|me|bio|tv|xyz)(\.br)?(/\S*)?([^a-z0-9]|$)' then return true; end if;
  if t ~* '(^|[^a-z0-9@.-])[a-z0-9][a-z0-9-]{1,}(\.[a-z0-9-]{2,})*\.(com\.br|net\.br|org\.br)([^a-z0-9]|$)' then return true; end if;
  -- @ de rede social (não conta e-mail, já tratado)
  if t ~ '(^|[^A-Za-z0-9._%+@-])@[A-Za-z0-9._]{3,}' then return true; end if;
  -- telefone brasileiro: celular (9 + 8 dígitos) ou fixo (2 a 5 + 7 dígitos), com ou sem DDD, +55, parênteses, espaços, pontos ou hífen
  if t ~ '(^|[^0-9,.])(\+?55[ .-]?)?\(?(1[1-9]|2[12478]|3[1-5789]|4[1-9]|5[1345]|6[1-9]|7[1345789]|8[1-9]|9[1-9])\)?[ .-]?9[ .-]?[0-9]{4}[ .-]?[0-9]{4}([^0-9]|$)' then return true; end if;
  if t ~ '(^|[^0-9,.])(\+?55[ .-]?)?\(?(1[1-9]|2[12478]|3[1-5789]|4[1-9]|5[1345]|6[1-9]|7[1345789]|8[1-9]|9[1-9])\)?[ .-]?[2-5][0-9]{3}[ .-]?[0-9]{4}([^0-9]|$)' then return true; end if;
  -- celular sem DDD, escrito como 9xxxx-xxxx (hífen ou espaço obrigatório, para não confundir com valores)
  if t ~ '(^|[^0-9,.])9[0-9]{4}[ -][0-9]{4}([^0-9]|$)' then return true; end if;
  return false;
end $$;

revoke all on function public.contact_in_text(text) from public, anon, authenticated;

-- ============ 2) A casa do usuário está no plano Grátis? (o dono da casa; equipe e admin não entram na regra)
create or replace function public.moderation_gratis_house(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses h where h.owner_id = p_user and h.plan::text = 'gratis');
$$;

revoke all on function public.moderation_gratis_house(uuid) from public, anon, authenticated;

-- ============ 3) Mensagem única, com o texto aprovado pelo advogado
create or replace function public.moderation_contact_message()
returns text language sql immutable set search_path = public as $$
  select 'No Plano Grátis, a divulgação de contatos externos e links não é permitida. Utilize o chat da plataforma para atender seus clientes.';
$$;

revoke all on function public.moderation_contact_message() from public, anon, authenticated;

-- ============ 4) Gatilho genérico: argumentos = colunas de texto a conferir; a casa vem de house_id, owner_id (houses) ou user_id/id (perfil, comentário)
create or replace function public.moderation_contact_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text; v_new text; v_old text; changed boolean := false; gratis boolean;
  j jsonb := to_jsonb(new); jo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
begin
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then return new; end if;
  foreach col in array tg_argv loop
    v_new := j ->> col;
    v_old := case when jo is null then null else jo ->> col end;
    if v_new is not null and v_new is distinct from v_old and public.contact_in_text(v_new) then changed := true; end if;
  end loop;
  if not changed then return new; end if;
  gratis := case tg_table_name
    when 'houses' then (j ->> 'plan') = 'gratis'
    when 'profiles' then public.moderation_gratis_house((j ->> 'id')::uuid)
    when 'post_comments' then public.moderation_gratis_house((j ->> 'user_id')::uuid)
    else exists (select 1 from public.houses h where h.id = (j ->> 'house_id')::uuid and h.plan::text = 'gratis')
  end;
  if gratis then raise exception '%', public.moderation_contact_message() using errcode = 'P0001'; end if;
  return new;
end $$;

revoke all on function public.moderation_contact_guard() from public, anon, authenticated;

drop trigger if exists trg_moderation_contact on public.houses;

create trigger trg_moderation_contact before insert or update on public.houses for each row execute function public.moderation_contact_guard('name', 'offerings');

drop trigger if exists trg_moderation_contact on public.profiles;

create trigger trg_moderation_contact before insert or update on public.profiles for each row execute function public.moderation_contact_guard('display_name', 'bio');

drop trigger if exists trg_moderation_contact on public.services;

create trigger trg_moderation_contact before insert or update on public.services for each row execute function public.moderation_contact_guard('title', 'description');

drop trigger if exists trg_moderation_contact on public.events;

create trigger trg_moderation_contact before insert or update on public.events for each row execute function public.moderation_contact_guard('title', 'description');

drop trigger if exists trg_moderation_contact on public.posts;

create trigger trg_moderation_contact before insert or update on public.posts for each row execute function public.moderation_contact_guard('content');

drop trigger if exists trg_moderation_contact on public.post_comments;

create trigger trg_moderation_contact before insert or update on public.post_comments for each row execute function public.moderation_contact_guard('text');

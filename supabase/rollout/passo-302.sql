-- PASSO 302: 0140_posts_com_a_cara_da_casa — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) posts ============
alter table public.posts add column if not exists card_style text;

alter table public.posts add column if not exists card_image_path text;

alter table public.posts add column if not exists card_rights_ack boolean not null default false;

-- força do fundo escuro atrás do texto (35 a 85 %), calculada na tela da casa a partir do brilho da foto; o banco só limita a faixa
alter table public.posts add column if not exists card_scrim smallint not null default 55 check (card_scrim between 35 and 85);

alter table public.posts drop constraint if exists posts_card_style_ok;

alter table public.posts add constraint posts_card_style_ok check (card_style is null or card_style in ('total', 'parcial'));

create or replace function public.can_use_styled_posts() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses h where h.owner_id = (select auth.uid()) and public.plan_cap_bool(h.plan::text, 'styled_posts'));
$$;

revoke execute on function public.can_use_styled_posts() from public, anon, authenticated;

grant execute on function public.can_use_styled_posts() to authenticated;

create or replace function public.posts_styled_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text;
begin
  select h.owner_id, h.plan::text into v_owner, v_plan from public.houses h where h.id = new.house_id;
  if v_owner is null then return new; end if;
  -- publicação real não aponta para endereço de fora: a única imagem possível é a enviada pela plataforma (card_image_path)
  if new.image_url is not null and (tg_op = 'INSERT' or new.image_url is distinct from old.image_url) then
    raise exception 'Posts com a cara da sua casa: a imagem precisa ser enviada pela própria plataforma.';
  end if;
  if new.card_style is null then
    if new.card_image_path is not null and (tg_op = 'INSERT' or new.card_image_path is distinct from old.card_image_path) then
      raise exception 'Posts com a cara da sua casa: escolha o estilo do card para usar uma imagem.';
    end if;
    new.card_rights_ack := false;
    return new;
  end if;
  if tg_op = 'INSERT' or new.card_style is distinct from old.card_style then
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
  return new;
end $$;

revoke execute on function public.posts_styled_guard() from public, anon, authenticated;

drop trigger if exists posts_styled_guard on public.posts;

create trigger posts_styled_guard before insert or update of card_style, card_image_path, image_url, content, card_rights_ack on public.posts
  for each row execute function public.posts_styled_guard();

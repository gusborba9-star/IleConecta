-- 0144 — Editar publicação e cuidar dos comentários (pedido do proprietário, 17/11/2026).
-- A casa passa a poder: (1) editar o TEXTO da própria publicação (aparece "editado"); (2) ocultar um comentário na sua publicação, podendo mostrar de novo
-- (quem escreveu continua vendo o próprio comentário; ocultar não apaga); (3) desativar os comentários de uma publicação.
-- Trava de dinheiro: enquanto há impulsionamento pago em andamento (aguardando ou ativo), imagem, estilo e letras do card NÃO mudam; só o texto.
-- Regras de texto (moderação de contato/promessa, limite de 400 no card, plano) continuam valendo na edição. Administração/SQL e cascatas não são afetadas.

-- 1) colunas
alter table public.posts add column if not exists edited_at timestamptz;

alter table public.posts add column if not exists comments_off boolean not null default false;

alter table public.post_comments add column if not exists hidden_by_house boolean not null default false;

alter table public.post_comments add column if not exists hidden_at timestamptz;

-- 2) guarda de edição da publicação
create or replace function public.posts_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then return new; end if;
  -- o que não é para mudar depois de publicado
  new.house_id := old.house_id;
  new.created_at := old.created_at;
  new.kind := old.kind;
  if new.content is distinct from old.content then
    if btrim(new.content) = '' then raise exception 'Escreva o texto da publicação.'; end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  if (new.card_style is distinct from old.card_style or new.card_image_path is distinct from old.card_image_path
      or new.image_url is distinct from old.image_url or new.card_scrim is distinct from old.card_scrim
      or new.card_rights_ack is distinct from old.card_rights_ack
      or new.card_font is distinct from old.card_font or new.card_size is distinct from old.card_size
      or new.card_color is distinct from old.card_color or new.card_align is distinct from old.card_align
      or new.card_pos is distinct from old.card_pos or new.card_bold is distinct from old.card_bold
      or new.card_italic is distinct from old.card_italic)
     and exists (select 1 from public.promotions p where p.item_type = 'post' and p.item_id = old.id and p.status in ('aguardando', 'ativa')) then
    raise exception 'Esta publicação está impulsionada. Até o impulsionamento terminar, só o texto pode ser editado.';
  end if;
  return new;
end $$;

revoke execute on function public.posts_edit_guard() from public, anon, authenticated;

drop trigger if exists posts_edit_guard on public.posts;

create trigger posts_edit_guard before update on public.posts for each row execute function public.posts_edit_guard();

-- 3) comentários: ninguém nasce oculto; com comentários desativados só a dona da casa comenta
create or replace function public.post_comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_off boolean; v_owner uuid;
begin
  new.hidden_by_house := false;
  new.hidden_at := null;
  if (select auth.uid()) is null then return new; end if;
  select p.comments_off, h.owner_id into v_off, v_owner from public.posts p join public.houses h on h.id = p.house_id where p.id = new.post_id;
  if coalesce(v_off, false) and v_owner is distinct from new.user_id then
    raise exception 'Os comentários desta publicação estão desativados.';
  end if;
  return new;
end $$;

revoke execute on function public.post_comments_guard() from public, anon, authenticated;

drop trigger if exists trg_post_comments_guard on public.post_comments;

create trigger trg_post_comments_guard before insert on public.post_comments for each row execute function public.post_comments_guard();

-- 4) ocultar / mostrar um comentário (só a dona da casa da publicação; a tabela não tem política de alteração)
create or replace function public.house_set_comment_hidden(p_comment uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.'; end if;
  if p_hidden is null then raise exception 'Informe se o comentário deve ficar oculto.'; end if;
  select h.owner_id into v_owner from public.post_comments c join public.posts p on p.id = c.post_id join public.houses h on h.id = p.house_id where c.id = p_comment;
  if v_owner is null or v_owner <> (select auth.uid()) then raise exception 'Você só pode cuidar dos comentários das publicações da sua casa.'; end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = v_owner) then raise exception 'Conta suspensa.'; end if;
  update public.post_comments set hidden_by_house = p_hidden, hidden_at = case when p_hidden then now() else null end where id = p_comment;
end $$;

revoke all on function public.house_set_comment_hidden(uuid, boolean) from public, anon;

grant execute on function public.house_set_comment_hidden(uuid, boolean) to authenticated;

-- 5) leitura: comentário oculto só aparece para quem escreveu e para a dona da casa
drop policy if exists comments_read on public.post_comments;

create policy comments_read on public.post_comments for select using (
  hidden_by_house = false
  or user_id = (select auth.uid())
  or exists (select 1 from public.posts p where p.id = post_id and public.is_house_owner(p.house_id))
);

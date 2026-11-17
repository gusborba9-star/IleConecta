-- PASSO 310: 0145_texto_travado_no_impulsionamento — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0145 — Texto da publicação impulsionada (decisão do proprietário, 17/11/2026).
-- Evita a manobra "contrato 10 dias, rodo um post por 3, troco tudo, rodo mais 4...": com impulsionamento pago aguardando ou ativo, o TEXTO só pode ser
-- corrigido UMA vez e só na primeira hora depois de contratar (conta a partir da compra mais antiga em andamento, para novas compras não reabrirem o prazo).
-- Passada a hora, ou depois da correção, o texto trava até o impulsionamento terminar. Imagem, estilo e letras já estavam travados (0144).
-- Sem impulsionamento em andamento, nada muda. Administração/SQL e cascatas não são afetadas.

-- 1) a regra num lugar só: 'livre' (sem impulsionamento), 'correcao' (uma correção disponível) ou 'travado'
create or replace function public.post_text_lock_state(p_post uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_first timestamptz; v_edited timestamptz;
begin
  select min(p.authorized_at) into v_first from public.promotions p where p.item_type = 'post' and p.item_id = p_post and p.status in ('aguardando', 'ativa');
  if v_first is null then return 'livre'; end if;
  select po.edited_at into v_edited from public.posts po where po.id = p_post;
  if now() < v_first + interval '60 minutes' and (v_edited is null or v_edited < v_first) then return 'correcao'; end if;
  return 'travado';
end $$;

revoke execute on function public.post_text_lock_state(uuid) from public, anon, authenticated;

-- 2) a tela pergunta pelos posts da própria casa que estão impulsionados (só o que ela mesma pode ver)
create or replace function public.my_post_text_locks() returns table (post_id uuid, state text, until timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, x.st, case when x.st = 'correcao' then x.first + interval '60 minutes' end
  from (
    select po.id, public.post_text_lock_state(po.id) st, (select min(p.authorized_at) from public.promotions p where p.item_type = 'post' and p.item_id = po.id and p.status in ('aguardando', 'ativa')) first
    from public.posts po join public.houses h on h.id = po.house_id
    where h.owner_id = (select auth.uid())
      and exists (select 1 from public.promotions p where p.item_type = 'post' and p.item_id = po.id and p.status in ('aguardando', 'ativa'))
  ) x;
$$;

revoke all on function public.my_post_text_locks() from public, anon;

grant execute on function public.my_post_text_locks() to authenticated;

-- 3) a guarda de edição passa a aplicar a regra ao texto (substitui a da 0144: mesmas regras + esta)
create or replace function public.posts_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lock text;
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then return new; end if;
  -- o que não é para mudar depois de publicado
  new.house_id := old.house_id;
  new.created_at := old.created_at;
  new.kind := old.kind;
  if new.content is distinct from old.content then
    if btrim(new.content) = '' then raise exception 'Escreva o texto da publicação.'; end if;
    v_lock := public.post_text_lock_state(old.id);
    if v_lock = 'travado' then
      raise exception 'Esta publicação está impulsionada. O texto só pode ser corrigido uma vez, na primeira hora depois de contratar; agora ele fica travado até o impulsionamento terminar.';
    end if;
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
    raise exception 'Esta publicação está impulsionada. Imagem, estilo e letras do card ficam travados até o impulsionamento terminar.';
  end if;
  return new;
end $$;

revoke execute on function public.posts_edit_guard() from public, anon, authenticated;

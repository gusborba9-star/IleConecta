-- PASSO 304: 0141_avisos_de_curtida_comentario_seguidor — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0141 — Avisos de curtida, comentário e novo seguidor para a casa (pedido do proprietário, 17/11/2026).
-- Antes só mensagem, passagem de assunto e avisos da administração tocavam o sino. Agora a casa sabe quando alguém interage com a publicação ou a segue.
-- Regras: só a casa (dona da publicação / seguida) recebe; nada para a própria pessoa; curtida e seguidor viram um aviso só por pessoa (curtir de novo
-- ou voltar a seguir não repete); várias curtidas ainda não lidas da mesma publicação viram uma linha ("Fulano e mais 9 pessoas curtiram...");
-- vários comentários da mesma pessoa na mesma publicação, também. Respeita "Não perturbe" e "Modo discreto" no celular (notify_push) e as
-- preferências por tipo. Quem está suspenso não gera aviso. Falha de aviso nunca desfaz a curtida, o comentário ou o seguir.

-- 1) tipos novos e colunas de apoio
alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (kind is null or kind in ('handoff', 'like', 'comment', 'follow'));

alter table public.notifications add column if not exists ref_id uuid;

alter table public.notifications add column if not exists actor_id uuid;

alter table public.notifications add column if not exists grouped integer not null default 1;

alter table public.notifications drop constraint if exists notifications_grouped_ok;

alter table public.notifications add constraint notifications_grouped_ok check (grouped between 1 and 1000000);

-- um aviso não lido por publicação (curtidas) e por pessoa+publicação (comentários): é o que permite agrupar sem corrida
create unique index if not exists notifications_like_group on public.notifications (user_id, ref_id) where kind = 'like' and read = false;

create unique index if not exists notifications_comment_group on public.notifications (user_id, ref_id, actor_id) where kind = 'comment' and read = false;

-- 2) preferências por tipo (a casa liga e desliga; padrão: ligado)
alter table public.notification_prefs add column if not exists notify_likes boolean not null default true;

alter table public.notification_prefs add column if not exists notify_comments boolean not null default true;

alter table public.notification_prefs add column if not exists notify_follows boolean not null default true;

-- 3) registro de quem já gerou aviso (uma vez por pessoa e publicação/casa): curtir, descurtir e curtir de novo não repete o aviso
create table if not exists public.social_notice_log (
  kind text not null check (kind in ('like', 'follow')),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (kind, actor_id, ref_id)
);

alter table public.social_notice_log enable row level security;

revoke all on public.social_notice_log from public, anon, authenticated;

-- 4) textos (um só lugar; o front só mostra)
create or replace function public.social_like_text(p_name text, p_n integer) returns text
language sql immutable set search_path = public as $$
  select case when p_n <= 1 then p_name || ' curtiu sua publicação.'
              when p_n = 2 then p_name || ' e mais 1 pessoa curtiram sua publicação.'
              else p_name || ' e mais ' || (p_n - 1)::text || ' pessoas curtiram sua publicação.' end;
$$;

create or replace function public.social_actor_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(left(btrim(p.display_name), 60), ''), 'Alguém') from public.profiles p where p.id = p_user;
$$;

revoke execute on function public.social_like_text(text, integer), public.social_actor_name(uuid) from public, anon, authenticated;

-- 5) curtida
create or replace function public.notify_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_name text; v_new int;
begin
  select h.owner_id into v_owner from public.posts p join public.houses h on h.id = p.house_id where p.id = new.post_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if not coalesce((select np.notify_likes from public.notification_prefs np where np.user_id = v_owner), true) then return new; end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = new.user_id) then return new; end if;
  insert into public.social_notice_log (kind, actor_id, ref_id) values ('like', new.user_id, new.post_id) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then return new; end if;
  v_name := coalesce(public.social_actor_name(new.user_id), 'Alguém');
  insert into public.notifications (user_id, text, href, kind, ref_id, actor_id, grouped)
  values (v_owner, public.social_like_text(v_name, 1), '/comunidade?post=' || new.post_id::text, 'like', new.post_id, new.user_id, 1)
  on conflict (user_id, ref_id) where kind = 'like' and read = false
  do update set grouped = public.notifications.grouped + 1, actor_id = excluded.actor_id,
                text = public.social_like_text(v_name, public.notifications.grouped + 1), created_at = now();
  return new;
exception when others then
  return new;
end $$;

revoke execute on function public.notify_post_like() from public, anon, authenticated;

drop trigger if exists trg_notify_post_like on public.post_likes;

create trigger trg_notify_post_like after insert on public.post_likes for each row execute function public.notify_post_like();

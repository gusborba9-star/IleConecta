-- 0171 — Categoria da publicação (21/11/2026): Giras e eventos, Avisos, Ensinamentos (ou geral). Coluna aditiva; as publicações antigas ficam "geral".
alter table public.posts add column if not exists category text not null default 'geral';
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts add constraint posts_category_check check (category in ('geral', 'evento', 'aviso', 'ensinamento'));
create index if not exists posts_category_created on public.posts (category, created_at desc);

-- PASSO 316: 0150_contagem_de_comentarios_do_feed — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0150 — Contagem de comentários do feed (teste de carga de 17/11/2026): o feed trazia TODOS os comentários de cada publicação (10 posts de 300 comentários = 1 MB e 190 ms).
-- Agora o feed traz só a contagem de cada uma e os comentários são lidos quando a pessoa abre a lista.
-- A função roda com os direitos de quem chama (a regra de leitura dos comentários vale): comentário oculto só conta para a casa dona e para quem escreveu.
create or replace function public.post_comment_counts(p_posts uuid[])
returns table (post_id uuid, n integer) language sql stable security invoker set search_path = public as $$
  select c.post_id, count(*)::integer from public.post_comments c
   where cardinality(p_posts) <= 200 and c.post_id = any (p_posts) group by c.post_id;
$$;

revoke all on function public.post_comment_counts(uuid[]) from public;

grant execute on function public.post_comment_counts(uuid[]) to anon, authenticated, service_role;

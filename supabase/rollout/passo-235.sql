-- PASSO 235: 0115_estado_como_sigla — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0115 — Estado do perfil como sigla (UF). Antes era texto livre ("RS", "RI", "Rio grande do Sul", "Río grande do Sul"), o que separava casas do mesmo estado
-- no destaque e no impulso por estado. Agora o banco guarda sempre a sigla; qualquer grafia antiga ou de aplicativo desatualizado é reconhecida.

create or replace function public.br_uf_from_text(p text) returns text
language sql immutable set search_path = public as $$
select coalesce(
  (select v.uf from (values
  ('AC', 'acre'),
  ('AL', 'alagoas'),
  ('AP', 'amapa'),
  ('AM', 'amazonas'),
  ('BA', 'bahia'),
  ('CE', 'ceara'),
  ('DF', 'distrito federal'),
  ('ES', 'espirito santo'),
  ('GO', 'goias'),
  ('MA', 'maranhao'),
  ('MT', 'mato grosso'),
  ('MS', 'mato grosso do sul'),
  ('MG', 'minas gerais'),
  ('PA', 'para'),
  ('PB', 'paraiba'),
  ('PR', 'parana'),
  ('PE', 'pernambuco'),
  ('PI', 'piaui'),
  ('RJ', 'rio de janeiro'),
  ('RN', 'rio grande do norte'),
  ('RS', 'rio grande do sul'),
  ('RO', 'rondonia'),
  ('RR', 'roraima'),
  ('SC', 'santa catarina'),
  ('SP', 'sao paulo'),
  ('SE', 'sergipe'),
  ('TO', 'tocantins'),
  ('DF', 'brasilia')
  ) as v(uf, nm) where lower(v.uf) = lower(btrim(p)) or v.nm = regexp_replace(lower(translate(btrim(p), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g') limit 1),
  null);
$$;

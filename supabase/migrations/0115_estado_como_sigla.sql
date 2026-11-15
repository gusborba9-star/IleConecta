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

create or replace function public.profiles_state_norm() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.state is not null and coalesce(new.country, 'BR') = 'BR' then new.state := public.br_uf_from_text(new.state); end if;
  return new;
end $$;

drop trigger if exists trg_profiles_state_norm on public.profiles;
create trigger trg_profiles_state_norm before insert or update of state on public.profiles for each row execute function public.profiles_state_norm();

revoke all on function public.br_uf_from_text(text), public.profiles_state_norm() from public, anon, authenticated;
grant execute on function public.br_uf_from_text(text) to service_role;

-- dados já salvos: o "RI" de Porto Alegre era erro de digitação (confirmado pelo proprietário: é RS)
update public.profiles set state = 'RS' where id = 'f847527a-266e-494d-9163-80736aeedae5' and state = 'RI';
update public.profiles set state = public.br_uf_from_text(state) where state is not null and state is distinct from public.br_uf_from_text(state);
-- o local guardado nas compras de destaque/impulso passa a usar a mesma sigla
update public.promotions set state_key = lower(public.br_uf_from_text(state_key)) where state_key is not null and public.br_uf_from_text(state_key) is not null and state_key <> lower(public.br_uf_from_text(state_key));

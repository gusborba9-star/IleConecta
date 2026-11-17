-- PASSO 307: 0142_letras_com_a_sua_identidade — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- A matriz salva troca o texto antigo pelo novo só se o proprietário não tiver mexido nele (edição dele vale mais).
do $$
declare v jsonb; ben jsonb; old_t text := 'Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com o texto sempre legível'; new_t text := 'Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com letras na sua identidade (fonte, cor e tamanho) e texto sempre legível';
begin
  select value into v from public.platform_settings where key = 'plan_matrix';
  if v is null then return; end if;
  ben := v -> 'copy' -> 'intermediario' -> 'benefits';
  if jsonb_typeof(ben) <> 'array' or not exists (select 1 from jsonb_array_elements(ben) x where x ->> 'text' = old_t) then return; end if;
  v := jsonb_set(v, '{copy,intermediario,benefits}',
    (select jsonb_agg(case when e ->> 'text' = old_t then jsonb_set(e, '{text}', to_jsonb(new_t)) else e end order by o) from jsonb_array_elements(ben) with ordinality t(e, o)));
  if public.plan_matrix_ok(v) then
    update public.platform_settings set value = v, updated_at = now() where key = 'plan_matrix';
  end if;
end
$$;

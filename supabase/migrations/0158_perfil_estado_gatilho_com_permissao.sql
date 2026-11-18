-- 0158 — Salvar o perfil falhava para quem estava logado ("Não foi possível salvar agora").
-- Causa (desde a 0115, 17/11/2026): o gatilho que transforma o estado em sigla (profiles_state_norm) roda com a permissão de quem salva e chama
-- br_uf_from_text, cuja execução foi retirada de quem está logado. Resultado: erro "permission denied for function br_uf_from_text" em todo salvamento
-- de perfil que inclui o estado (foto, nome, cidade...). Os testes locais não pegaram porque o banco de teste liberava todas as funções.
-- Correção: o gatilho passa a rodar com a permissão do dono da função (SECURITY DEFINER, caminho fixo), como os demais gatilhos internos.
-- A função auxiliar continua fechada para quem está logado. Pode rodar de novo sem problema.

create or replace function public.profiles_state_norm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.state is not null and coalesce(new.country, 'BR') = 'BR' then new.state := public.br_uf_from_text(new.state); end if;
  return new;
end $$;

revoke all on function public.profiles_state_norm() from public, anon, authenticated;

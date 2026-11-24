-- 0199 — Limite suave de cadastros por rede (decisão do proprietário, 24/11/2026; resposta do advogado: IP é sinal, nunca banimento).
-- Roda como "gancho antes de criar usuário" da autenticação do Supabase (Authentication → Hooks → Before User Created), por isso vale
-- até para quem chamar a API direto, sem passar pela tela. Mais de 5 cadastros na mesma rede em 1 hora: "tente mais tarde". Nada é banido,
-- nada fica gravado além da hora: guardamos só um código irreversível da rede (hash com chave do servidor) na tabela de limites, que se limpa em 3 dias.
-- Cuidados (CGNAT e Wi-Fi compartilhado no Brasil): o limite é por hora e a janela se renova sozinha; redes IPv6 contam pelo bloco /64.
-- Se o IP não vier, ou qualquer coisa falhar aqui dentro, o cadastro SEGUE (nunca travamos todo mundo por um erro nosso).

insert into public.app_secrets (key, value) values ('net_salt', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;

create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ip text; v_net text; v_salt text; v_key text;
begin
  begin
    v_ip := nullif(btrim(coalesce(event -> 'metadata' ->> 'ip_address', '')), '');
    if v_ip is null then return '{}'::jsonb; end if;
    -- network() zera os bits de host: sem ele o /64 não agruparia os endereços da mesma rede IPv6
    v_net := host(network(set_masklen(v_ip::inet, case when family(v_ip::inet) = 6 then 64 else 32 end)));
    select value into v_salt from public.app_secrets where key = 'net_salt';
    if v_salt is null then return '{}'::jsonb; end if;
    v_key := encode(extensions.digest(v_net || ':' || v_salt, 'sha256'), 'hex');
    if not public.recovery_throttle_hit('su:' || v_key, 5) then
      return jsonb_build_object('error', jsonb_build_object('http_code', 429,
        'message', 'Muitas tentativas de cadastro a partir desta rede. Tente novamente mais tarde.'));
    end if;
  exception when others then
    return '{}'::jsonb;
  end;
  return '{}'::jsonb;
end $$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

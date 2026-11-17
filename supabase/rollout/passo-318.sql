-- PASSO 318: 0152_registro_de_acesso — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0152 — Registro de acesso à aplicação (Marco Civil da Internet, art. 15): conta, endereço IP, data e hora, guardados por 6 meses.
-- Decisão do proprietário (17/11/2026), prazo na tabela validada pelo advogado. Só o servidor lê (nenhuma pessoa, nem a casa, nem o painel, vê pela tela);
-- a consulta é feita pelo proprietário, no banco, mediante pedido legal. Não guarda navegador nem aparelho. Sem chave estrangeira de propósito:
-- o registro precisa sobreviver à exclusão da conta pelo prazo legal. Pode rodar de novo sem problema.
create table if not exists public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ip inet not null,
  at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '6 months'
);

create index if not exists access_logs_user_idx on public.access_logs (user_id, at desc);

create index if not exists access_logs_purge_idx on public.access_logs (purge_after);

alter table public.access_logs enable row level security;

revoke all on table public.access_logs from public, anon, authenticated;

-- Chamada pelo app uma vez por sessão aberta. Lê o IP dos cabeçalhos do servidor (nunca do que o app envia).
-- No máximo um registro por conta e IP a cada 30 minutos e 200 por conta por dia: o log não vira meio de encher o banco.
-- Nunca devolve erro nem dado: falhar aqui não pode atrapalhar o uso do app.
create or replace function public.register_access() returns void
language plpgsql security definer set search_path = public as $$
declare hdr json; ip_txt text; v_ip inet; me uuid := auth.uid();
begin
  if me is null then return; end if;
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  ip_txt := coalesce(
    nullif(btrim(hdr ->> 'cf-connecting-ip'), ''),
    nullif(btrim(hdr ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), ''));
  begin
    v_ip := ip_txt::inet;
  exception when others then
    v_ip := null;
  end;
  if v_ip is null then return; end if;
  if exists (select 1 from public.access_logs where user_id = me and ip = v_ip and at > now() - interval '30 minutes') then return; end if;
  if (select count(*) from public.access_logs where user_id = me and at > now() - interval '1 day') >= 200 then return; end if;
  insert into public.access_logs (user_id, ip) values (me, v_ip);
exception when others then
  return;
end $$;

revoke all on function public.register_access() from public, anon;

grant execute on function public.register_access() to authenticated;

create or replace function public.purge_access_logs() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.access_logs where purge_after < now() returning 1) select count(*) into n from d;
  return n;
end $$;

revoke all on function public.purge_access_logs() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('purge-access-logs', '40 3 * * *', 'select public.purge_access_logs()');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

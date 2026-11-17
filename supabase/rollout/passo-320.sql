-- PASSO 320: 0154_ia_reserva_de_resposta_e_modelo_fixo — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0154 — Custo da IA: (1) reserva atômica de cada resposta antes de chamar o modelo; (2) a casa não escolhe mais o modelo.
-- Achados no estudo de custo da Fase 6 (17/11/2026):
--  (1) A função da assistente conferia o limite por pessoa (20 em 10 min) e a franquia do mês ANTES de chamar o modelo e só gravava o uso DEPOIS.
--      Muitas requisições ao mesmo tempo passavam todas pela conferência e cada uma gerava custo: o limite não valia contra paralelismo.
--      Agora cada resposta em andamento fica reservada (assistant_inflight, por até 120 s) e entra na conta da franquia, do crédito e do limite por pessoa.
--  (2) assistants.model era gravável pelo dono da casa (RLS permite) e a função usava o valor como primeiro modelo: a casa podia escolher um modelo caro
--      e a plataforma pagaria o preço dele cobrando uma resposta. Agora só a administração (ou o banco) grava o modelo; a função também só aceita a lista da plataforma.
-- Pode rodar de novo sem problema.

create table if not exists public.assistant_inflight (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_inflight_house_idx on public.assistant_inflight (house_id);

create index if not exists assistant_inflight_user_idx on public.assistant_inflight (user_id, house_id);

create index if not exists assistant_inflight_created_idx on public.assistant_inflight (created_at);

alter table public.assistant_inflight enable row level security;

revoke all on public.assistant_inflight from public, anon, authenticated;

-- Reserva uma resposta. Devolve quantas já estavam em andamento ANTES desta (na casa e para esta pessoa); a função soma isso ao uso já gravado.
-- A trava serializa os pedidos da mesma casa: dois pedidos simultâneos nunca enxergam "zero em andamento" ao mesmo tempo.
create or replace function public.assistant_reserve(p_house uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_house int; v_user int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('assistant_reserve:' || p_house::text, 0));
  -- reserva esquecida (função que caiu no meio) expira sozinha; o modelo tem 25 s de limite, então 120 s é folga larga
  delete from public.assistant_inflight where created_at < now() - interval '120 seconds';
  select count(*)::int, count(*) filter (where user_id = p_user)::int into v_house, v_user from public.assistant_inflight where house_id = p_house;
  insert into public.assistant_inflight (house_id, user_id) values (p_house, p_user) returning id into v_id;
  return jsonb_build_object('id', v_id, 'house', v_house, 'user', v_user);
end $$;

create or replace function public.assistant_release(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  delete from public.assistant_inflight where id = p_id;
end $$;

revoke all on function public.assistant_reserve(uuid, uuid), public.assistant_release(uuid) from public, anon, authenticated;

grant execute on function public.assistant_reserve(uuid, uuid), public.assistant_release(uuid) to service_role;

-- O modelo da assistente só é gravado pela administração ou direto no banco (sem usuário). Para a casa, qualquer valor novo vira "padrão da plataforma".
create or replace function public.assistants_model_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.model is null then return new; end if;
  if tg_op = 'UPDATE' and new.model is not distinct from old.model then return new; end if;
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if exists (select 1 from public.admins where user_id = auth.uid()) then return new; end if;
  new.model := null;
  return new;
end $$;

drop trigger if exists trg_assistants_model_guard on public.assistants;

create trigger trg_assistants_model_guard before insert or update on public.assistants
for each row execute function public.assistants_model_guard();

revoke all on function public.assistants_model_guard() from public, anon, authenticated;

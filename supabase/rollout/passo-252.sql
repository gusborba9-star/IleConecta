-- PASSO 252: 0121_moderacao_fase2 — parte 2 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) Fila e período de adaptação
create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  target_table text not null check (target_table in ('services', 'events', 'posts')),
  target_id uuid not null,
  reason text not null default 'promessa' check (reason in ('promessa', 'contato_antigo')),
  excerpt text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'orientada', 'advertida', 'ocultada', 'contestada', 'encerrada')),
  outcome text check (outcome in ('corrigido', 'dispensado', 'contestacao_aceita')),
  created_at timestamptz not null default now(),
  orientation_at timestamptz,
  warned_at timestamptz,
  deadline_at timestamptz,
  hidden_at timestamptz,
  contested_at timestamptz,
  contest_text text,
  contest_decision text check (contest_decision in ('mantida')),
  admin_note text,
  handled_by uuid references auth.users(id),
  closed_at timestamptz
);

create unique index if not exists moderation_flags_one_open on public.moderation_flags (target_table, target_id) where status <> 'encerrada';

create index if not exists moderation_flags_house on public.moderation_flags (house_id, created_at desc);

create index if not exists moderation_flags_status on public.moderation_flags (status, created_at desc);

alter table public.moderation_flags enable row level security;

-- sem políticas: ninguém lê nem escreve direto; tudo passa pelas funções abaixo

create table if not exists public.moderation_settings (
  id boolean primary key default true check (id),
  adaptation_start timestamptz,
  adaptation_days integer not null default 30 check (adaptation_days between 1 and 365)
);

insert into public.moderation_settings (id) values (true) on conflict do nothing;

alter table public.moderation_settings enable row level security;

-- ============ 4) Aviso à casa (notificação curta; o texto completo fica na tela /moderacao)
create or replace function public.moderation_notify(p_house uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, text, href) select h.owner_id, p_text, '/moderacao' from public.houses h where h.id = p_house;
end $$;

revoke all on function public.moderation_notify(uuid, text) from public, anon, authenticated;

-- ============ 5) Gatilho: sinaliza (sem recusar) e fecha o chamado sozinho quando o texto é corrigido
create or replace function public.moderation_promise_watch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new); cols text[] := tg_argv; col text; txt text := ''; bad boolean; hid uuid; f record;
begin
  foreach col in array cols loop txt := txt || ' ' || coalesce(j ->> col, ''); end loop;
  hid := (j ->> 'house_id')::uuid;
  bad := public.promise_in_text(txt);
  select * into f from public.moderation_flags where target_table = tg_table_name and target_id = new.id and status <> 'encerrada';
  if bad then
    if f.id is null then
      insert into public.moderation_flags (house_id, target_table, target_id, reason, excerpt)
      values (hid, tg_table_name, new.id, 'promessa', left(btrim(txt), 300));
    end if;
  elsif f.id is not null and f.reason = 'promessa' then
    perform set_config('app.moderation', '1', true);
    execute format('update public.%I set moderation_hidden = false where id = $1', tg_table_name) using new.id;
    update public.moderation_flags set status = 'encerrada', outcome = 'corrigido', closed_at = now() where id = f.id;
    if f.status in ('advertida', 'ocultada', 'contestada') then
      perform public.moderation_notify(hid, 'Obrigado por ajustar o anúncio. Ele está regularizado no Ilê Conecta.');
    end if;
  end if;
  return new;
end $$;

revoke all on function public.moderation_promise_watch() from public, anon, authenticated;

drop trigger if exists trg_moderation_promise on public.services;

create trigger trg_moderation_promise after insert or update of title, description on public.services for each row execute function public.moderation_promise_watch('title', 'description');

drop trigger if exists trg_moderation_promise on public.events;

create trigger trg_moderation_promise after insert or update of title, description on public.events for each row execute function public.moderation_promise_watch('title', 'description');

drop trigger if exists trg_moderation_promise on public.posts;

create trigger trg_moderation_promise after insert or update of content on public.posts for each row execute function public.moderation_promise_watch('content');

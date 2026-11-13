-- Aviso de mudança dos textos (Termos) sem travar a tela de ninguém: notificação com link para o texto novo e registro de quando foi lida.
-- 1) a notificação passa a guardar o momento em que foi lida; 2) função de aviso geral, só do servidor (rodada pelo SQL Editor).
-- Rode no SQL Editor. É seguro repetir.

-- ============ 1) momento da leitura ============
alter table public.notifications add column if not exists read_at timestamptz;

create or replace function public.notifications_read_at() returns trigger
language plpgsql set search_path = public as $$
begin
if new.read and not old.read then new.read_at := now();
elsif not new.read then new.read_at := null;
else new.read_at := old.read_at;
end if;
return new;
end $$;

drop trigger if exists trg_notifications_read_at on public.notifications;

create trigger trg_notifications_read_at before update on public.notifications
for each row execute function public.notifications_read_at();

-- ============ 2) aviso geral: uma notificação por pessoa, sem repetir ============
create or replace function public.platform_announce(p_text text, p_href text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
if coalesce(char_length(btrim(p_text)), 0) < 10 or char_length(p_text) > 400 then raise exception 'Texto do aviso inválido.'; end if;
if p_href is not null and p_href !~ '^/([A-Za-z0-9_?=&#.-][A-Za-z0-9/_?=&#.-]{0,199})?$' then raise exception 'Endereço do aviso inválido.'; end if;
insert into public.notifications (user_id, text, href)
select p.id, btrim(p_text), p_href from public.profiles p
where not exists (select 1 from public.notifications x where x.user_id = p.id and x.text = btrim(p_text));
get diagnostics n = row_count;
return n;
end $$;

-- ============ 7) permissões ============
revoke all on function public.notifications_read_at(), public.platform_announce(text, text) from public, anon, authenticated;

grant execute on function public.platform_announce(text, text) to service_role;

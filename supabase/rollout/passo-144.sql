-- PASSO 144: 0097_aviso_termos_e_leitura — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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

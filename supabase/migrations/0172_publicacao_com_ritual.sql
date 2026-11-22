-- 0172 — Publicação pode anexar um ritual da própria casa (21/11/2026): o cartão da gira no feed leva a "Reservar vaga".
alter table public.posts add column if not exists event_id uuid references public.events(id) on delete set null;
create or replace function public.posts_event_same_house() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_id is not null and not exists (select 1 from public.events e where e.id = new.event_id and e.house_id = new.house_id) then
    raise exception 'O ritual escolhido não pertence a esta casa.';
  end if;
  return new;
end $$;
drop trigger if exists posts_event_same_house on public.posts;
create trigger posts_event_same_house before insert or update of event_id on public.posts for each row execute function public.posts_event_same_house();

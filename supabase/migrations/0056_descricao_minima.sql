-- Descrição mínima de 20 letras em rituais (events) e serviços (services), decisão de 01/11/2026.
-- A assistente usa a descrição para apresentar antes do pagamento. Vale para novos cadastros e para quem
-- editar a descrição; registros antigos curtos continuam funcionando até a casa editar o texto.
create or replace function public.enforce_min_description() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.description is distinct from old.description then
    if char_length(btrim(coalesce(new.description, ''))) < 20 then
      raise exception 'descricao_curta: use ao menos 20 letras na descrição' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists events_min_description on public.events;
create trigger events_min_description before insert or update on public.events
  for each row execute function public.enforce_min_description();

drop trigger if exists services_min_description on public.services;
create trigger services_min_description before insert or update on public.services
  for each row execute function public.enforce_min_description();

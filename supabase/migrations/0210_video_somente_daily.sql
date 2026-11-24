-- Vídeo: o Whereby sai (limite de 30 minutos e 4 pessoas, mensalidade): o único provedor é o Daily. Nenhuma reunião usou o Whereby.
-- A configuração do painel e a coluna provider passam a aceitar só 'daily'. Um provedor novo entra por uma migração própria.
do $$
declare d text; c text;
begin
  select pg_get_functiondef('public.video_config_ok(jsonb)'::regprocedure) into d;
  if position('not in (''daily'', ''whereby'')' in d) = 0 then raise exception 'video_config_ok: texto esperado não encontrado'; end if;
  execute replace(d, 'not in (''daily'', ''whereby'')', 'not in (''daily'')');

  select pg_get_functiondef('public.admin_set_setting(text,jsonb)'::regprocedure) into d;
  if position('provedor (Daily ou Whereby)' in d) = 0 then raise exception 'admin_set_setting: texto esperado não encontrado'; end if;
  execute replace(d, 'provedor (Daily ou Whereby)', 'provedor (Daily)');

  if exists (select 1 from public.video_meetings where provider <> 'daily') then raise exception 'há reunião em outro provedor'; end if;
  for c in select conname from pg_constraint where conrelid = 'public.video_meetings'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%whereby%' loop
    execute format('alter table public.video_meetings drop constraint %I', c);
  end loop;
  alter table public.video_meetings add constraint video_meetings_provider_check check (provider in ('daily'));
end $$;

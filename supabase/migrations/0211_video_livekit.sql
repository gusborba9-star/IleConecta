-- Vídeo: a LiveKit entra como segundo provedor (tela própria "Premium"). O Daily continua; o painel escolhe o ativo e cada reunião guarda o seu.
do $$
declare d text;
begin
  select pg_get_functiondef('public.video_config_ok(jsonb)'::regprocedure) into d;
  if position('not in (''daily'')' in d) = 0 then raise exception 'video_config_ok: texto esperado não encontrado'; end if;
  execute replace(d, 'not in (''daily'')', 'not in (''daily'', ''livekit'')');

  select pg_get_functiondef('public.admin_set_setting(text,jsonb)'::regprocedure) into d;
  if position('provedor (Daily)' in d) = 0 then raise exception 'admin_set_setting: texto esperado não encontrado'; end if;
  execute replace(d, 'provedor (Daily)', 'provedor (Daily ou LiveKit)');

  alter table public.video_meetings drop constraint video_meetings_provider_check;
  alter table public.video_meetings add constraint video_meetings_provider_check check (provider in ('daily', 'livekit'));
end $$;

-- Presença: a casa passa a contar como offline 35 s depois de fechar o app (antes eram 3 minutos).
-- O app avisa a cada 15 s enquanto está aberto e visível, então 35 s tolera uma falha de rede sem deixar a casa "online" à toa.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('peer_info', 'notify_new_message') and p.prokind = 'f'
  loop
    def := pg_get_functiondef(f.oid);
    if def like '%interval ''3 minutes''%' then
      execute replace(def, 'interval ''3 minutes''', 'interval ''35 seconds''');
    end if;
  end loop;
end $$;

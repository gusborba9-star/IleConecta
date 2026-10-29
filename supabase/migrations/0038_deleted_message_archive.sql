-- Mensagem apagada para todos continua guardada em arquivo privado por 30 dias, só para a equipe avaliar denúncias.
-- Ninguém (nem quem enviou, nem quem recebeu) lê esse arquivo pelo app. É seguro repetir.

create table if not exists public.message_archive (
  message_id uuid primary key,
  conversation_id uuid not null,
  sender_id uuid not null,
  original_text text not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '30 days'
);
alter table public.message_archive enable row level security;
revoke all on public.message_archive from anon, authenticated;

create or replace function public.delete_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into m from public.messages
  where id = p_id and sender_id = auth.uid() and from_assistant = false and deleted_at is null
    and created_at > now() - interval '2 days';
  if not found then raise exception 'Não foi possível apagar esta mensagem.'; end if;
  insert into public.message_archive (message_id, conversation_id, sender_id, original_text)
  values (m.id, m.conversation_id, m.sender_id, m.text) on conflict do nothing;
  update public.messages set text = '[mensagem apagada]', deleted_at = now() where id = p_id;
end $$;

-- A denúncia guarda o texto original também das mensagens que a outra parte apagou (se ainda estiverem no arquivo).
create or replace function public.report_user(p_other uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; snap jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_other = auth.uid() then raise exception 'Operação inválida.'; end if;
  if p_reason = 'outro' and length(trim(coalesce(p_details, ''))) < 10 then
    raise exception 'Descreva o que aconteceu (mínimo de 10 caracteres).';
  end if;
  select cm1.conversation_id into cid from public.conversation_members cm1
    join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
    where cm1.user_id = auth.uid() and cm2.user_id = p_other limit 1;
  select coalesce(jsonb_agg(x order by x.at), '[]'::jsonb) into snap from (
    select m.created_at as at, m.sender_id as sender, m.from_assistant as assistant,
           coalesce(a.original_text, m.text) as text, (m.deleted_at is not null) as deleted
    from public.messages m left join public.message_archive a on a.message_id = m.id
    where m.conversation_id = cid order by m.created_at desc limit 30
  ) x;
  insert into public.chat_reports (reporter_id, reported_id, conversation_id, reason, details, snapshot)
  values (auth.uid(), p_other, cid, p_reason, left(nullif(trim(coalesce(p_details, '')), ''), 1000), snap);
end $$;

-- Limpeza diária do arquivo (LGPD: não guardar além do necessário).
do $$
begin
  perform cron.schedule('purge-message-archive', '30 3 * * *', 'delete from public.message_archive where purge_after < now()');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;

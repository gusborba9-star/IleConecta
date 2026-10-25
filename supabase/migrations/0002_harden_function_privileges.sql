revoke execute on function public.protect_house_privileged_columns() from public, anon, authenticated;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;
comment on table public.webhook_events is 'Somente service_role (sem policies de proposito).';

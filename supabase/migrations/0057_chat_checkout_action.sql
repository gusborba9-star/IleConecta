-- Botão de pagamento dentro do chat: a assistente (servidor) grava qual ritual ou serviço o botão abre.
-- Formato: {"target":"ritual"|"service","id":"<uuid>"}. O preço e a vaga continuam vindo do banco ao abrir o pagamento.
alter table public.messages add column if not exists action jsonb;
alter table public.messages drop constraint if exists messages_action_shape;
alter table public.messages add constraint messages_action_shape check (
  action is null or (
    jsonb_typeof(action) = 'object'
    and action ->> 'target' in ('ritual', 'service')
    and (action ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
  )
);

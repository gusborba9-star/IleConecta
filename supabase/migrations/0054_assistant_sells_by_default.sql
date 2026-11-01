-- Regra do Ilê Conecta: toda casa começa com a assistente ligada e vendendo pela plataforma.
-- A casa pode desligar a venda (a assistente passa a atender e transferir para a casa), exceto nos
-- rituais coletivos, que a assistente sempre conduz e vende. O plano Base continua sem assistente.
-- Rode no SQL Editor. É seguro repetir.
alter table public.assistants alter column enabled set default true;
alter table public.assistants alter column can_sell set default true;

-- Casas existentes: ninguém tinha desligado a venda de propósito (antes ela vinha desligada e só o
-- plano Máximo podia ligar), então todas passam a vender. Quem não quiser desliga no painel.
update public.assistants set can_sell = true where can_sell = false;

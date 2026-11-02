-- Reserva de serviço pago: o pedido espera o pagamento por 15 minutos (mesma regra da vaga de ritual).
-- Troca o prazo dentro da função create_service_order. É seguro repetir.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.create_service_order(uuid,text)'::regprocedure);
  if d like '%interval ''30 minutes''%' then
    execute replace(d, 'interval ''30 minutes''', 'interval ''15 minutes''');
  end if;
end $$;

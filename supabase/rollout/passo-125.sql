-- PASSO 125: 0094_cobranca_automatica_cartao — parte 11 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- grava o resultado e avisa a casa (aviso em texto simples, sem dado técnico)
create or replace function public.platform_auto_attempt_result(p_charge uuid, p_attempt int, p_outcome text, p_ref text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; a public.platform_auto_attempts; v_owner uuid; v_msg text; v_max int := public.billing_auto_max_attempts();
begin
if p_outcome not in ('aprovada', 'recusada', 'exige_acao', 'processando') then raise exception 'Resultado inválido.'; end if;
select * into c from public.platform_charges where id = p_charge;
if not found then raise exception 'Fatura inexistente.'; end if;
select * into a from public.platform_auto_attempts where charge_id = p_charge and attempt = p_attempt for update;
if not found then raise exception 'Tentativa inexistente.'; end if;
if a.outcome <> 'iniciada' then return; end if; -- já registrada (reenvio): não avisa duas vezes
update public.platform_auto_attempts set outcome = p_outcome, ref = left(p_ref, 200), error_code = left(p_code, 80), updated_at = now() where id = a.id;
select owner_id into v_owner from public.houses where id = c.house_id;
if v_owner is null then return; end if;
v_msg := case
when p_outcome = 'aprovada' then 'Cobramos a fatura da plataforma no cartão final ' || coalesce(a.last4, '') || '. Pagamento confirmado, obrigado!'
when p_outcome in ('recusada', 'exige_acao') and p_attempt < v_max then
case when p_outcome = 'exige_acao' then 'O seu banco pediu uma confirmação extra e não conseguimos cobrar a fatura no cartão final ' || coalesce(a.last4, '') || ' (tentativa ' || p_attempt || ' de ' || v_max || '). Tentaremos de novo amanhã. Você também pode pagar agora ou trocar o cartão.'
else 'Não conseguimos cobrar a fatura no cartão final ' || coalesce(a.last4, '') || ' (tentativa ' || p_attempt || ' de ' || v_max || '). Tentaremos de novo amanhã. Você também pode pagar agora ou trocar o cartão.' end
when p_outcome in ('recusada', 'exige_acao') then 'Não foi possível cobrar a fatura no cartão final ' || coalesce(a.last4, '') || ' depois de ' || v_max || ' tentativas. Pague a fatura por Pix ou cartão, ou troque o cartão, para evitar a suspensão parcial da casa.'
else null end;
if v_msg is not null then insert into public.notifications (user_id, text, href) values (v_owner, v_msg, '/planos'); end if;
end $$;

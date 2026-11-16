-- PASSO 278: 0129_central_de_pendencias_admin — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0129 — Central de pendências da administração (Fase 5). SÓ LEITURA.
-- Junta, numa lista única, o que está esperando ação da administração, lendo as tabelas originais na hora
-- (sem cópia, sem tabela nova). Cada linha aponta para a origem (kind + ref_id) e para a tela onde se resolve (tab).
-- Prazos padrão (horas) ficam em pending_deadline_hours(): fonte única, para o painel e os testes.

-- ============ 1) prazos padrão por tipo ============
create or replace function public.pending_deadline_hours(p_kind text)
returns integer language sql immutable set search_path = public as $$
  select case p_kind
    when 'denuncia_chat' then 72
    when 'avaliacao_denunciada' then 120
    when 'moderacao_pendente' then 72
    when 'moderacao_contestada' then 72
    when 'reembolso_cliente' then 48
    when 'reembolso_aprovado' then 24
    when 'reembolso_plataforma' then 2
    when 'cobranca_travada' then 72
    else null end;
$$;

-- ============ 1b) avaliação denunciada: encerrar a denúncia sem esconder ============
-- Antes só dava para esconder; mantida visível, a denúncia ficaria pendente para sempre.
alter table public.reviews add column if not exists report_reviewed_at timestamptz;

create or replace function public.admin_review_report_keep(p_review uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.reviews set report_reviewed_at = now() where id = p_review and reported_at is not null;
  if not found then raise exception 'review_not_reported' using errcode = 'P0002'; end if;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
  values (auth.uid(), 'review_report_kept', null, jsonb_build_object('review', p_review));
end $$;

-- Endurecimento: depois que a administração encerra a denúncia mantendo a avaliação, a casa não contesta de novo
-- (evita reabrir a mesma pendência sem fim). Escondida ou não, uma avaliação já analisada não volta à fila.
create or replace function public.report_review(p_review uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_reviewed timestamptz; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then raise exception 'Explique o motivo em 5 a 300 caracteres.'; end if;
  select h.owner_id, r.report_reviewed_at into v_owner, v_reviewed from public.reviews r join public.houses h on h.id = r.house_id where r.id = p_review;
  if v_owner is null or v_owner is distinct from auth.uid() then raise exception 'Só a casa avaliada pode contestar.'; end if;
  if v_reviewed is not null then raise exception 'A administração já analisou a contestação desta avaliação.'; end if;
  update public.reviews set reported_at = now(), report_reason = v_reason where id = p_review;
end $$;

-- A lista do painel passa a informar se a denúncia já foi analisada.
create or replace function public.admin_reported_reviews()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'house', h.name, 'rating', r.rating, 'comment', r.comment, 'report_reason', r.report_reason,
      'reported_at', r.reported_at, 'hidden', r.hidden, 'reviewed_at', r.report_reviewed_at) order by r.reported_at desc)
    from public.reviews r join public.houses h on h.id = r.house_id where r.reported_at is not null), '[]'::jsonb);
end $$;

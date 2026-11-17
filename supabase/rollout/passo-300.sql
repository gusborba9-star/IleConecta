-- PASSO 300: 0139_trava_por_modulo — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0139 — Trava por módulo nas funções e políticas da administração.
-- Troca, dentro de cada função/política listada, a checagem public.is_admin() por public.admin_can('<módulo>') (dono tem todos os módulos).
-- Não reescreve a lógica: só a checagem. Pode rodar de novo (onde já foi trocada, não há mais nada a trocar).
-- Funções genéricas de visibilidade (can_view_profile, house_visible_to_me, guardas de escrita, my_account_gate) continuam com is_admin().
do $$
declare
  v_map constant jsonb := '{
    "suporte": ["admin_support_queue","admin_support_dossier","admin_support_refresh_facts","admin_support_reply","admin_support_request_version","admin_support_set_status","admin_support_decide","open_support_case"],
    "moderacao": ["admin_moderation_list","admin_moderation_act","admin_moderation_scan","admin_moderation_start_adaptation","admin_reported_reviews","admin_review_report_keep","admin_set_review_hidden","admin_chat_reports","admin_resolve_chat_report","report_file_visible"],
    "comunicacao": ["admin_announce","admin_announce_count","admin_announcements_list","admin_notify_returning","admin_returning_accounts","admin_returning_history","admin_search_recipients"],
    "indicadores": ["admin_metrics","admin_indicators","admin_finance_summary","admin_finance_anomalies","admin_houses_plans","admin_houses_seats","admin_pending_center","admin_house_timeline","admin_staff_audit","admin_refund_context","admin_refund_records"],
    "contas": ["admin_suspend_account","admin_unsuspend_account"],
    "dono": ["admin_audit_feed","admin_save_doc","admin_set_setting","admin_set_support_email","admin_set_fee_rules","admin_set_house_plan","admin_set_house_seats","admin_set_promo_limit","admin_set_billing_holiday","admin_billing_enroll","admin_billing_reactivate","admin_billing_unenroll","admin_price_announce","admin_price_cancel","admin_house_tax_id","admin_house_tax_id_set","admin_deleted_identity","admin_decide_account_deletion","complete_refund","decide_refund","platform_charge_cancel","event_records_access"]
  }';
  v_pol_suporte constant text[] := array['refund_requests.refund_read','legal_consents.legal_consents_read','objects.evidence: admin lê provas de chamado'];
  m text; n text; r record; d text; v_mod text; q text; w text; v_done int := 0;
begin
  for m in select jsonb_object_keys(v_map) loop
    for n in select jsonb_array_elements_text(v_map -> m) loop
      select p.oid, pg_get_functiondef(p.oid) as def into r
        from pg_proc p where p.proname = n and p.pronamespace = 'public'::regnamespace;
      if r.oid is null then raise exception 'função ausente: %', n; end if;
      if r.def ~ 'public\.is_admin\(\)' then
        d := regexp_replace(r.def, 'public\.is_admin\(\)', format('public.admin_can(%L)', m), 'g');
        execute d; v_done := v_done + 1;
      end if;
    end loop;
  end loop;

  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies
            where schemaname in ('public', 'storage') and (qual ~ 'is_admin' or with_check ~ 'is_admin') loop
    v_mod := case when (r.tablename || '.' || r.policyname) = any (v_pol_suporte) then 'suporte' else 'dono' end;
    q := case when r.qual is null then null else regexp_replace(regexp_replace(r.qual, 'public\.is_admin\(\)', format('public.admin_can(%L)', v_mod), 'g'), '(^|[^.])is_admin\(\)', '\1' || format('public.admin_can(%L)', v_mod), 'g') end;
    w := case when r.with_check is null then null else regexp_replace(regexp_replace(r.with_check, 'public\.is_admin\(\)', format('public.admin_can(%L)', v_mod), 'g'), '(^|[^.])is_admin\(\)', '\1' || format('public.admin_can(%L)', v_mod), 'g') end;
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
      || coalesce(' using (' || q || ')', '') || coalesce(' with check (' || w || ')', '');
    v_done := v_done + 1;
  end loop;
  raise notice 'travas aplicadas: %', v_done;
end
$$;

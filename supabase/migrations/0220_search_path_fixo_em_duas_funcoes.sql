-- 0220 — Aviso do Supabase "function_search_path_mutable": duas funções puras (sem SECURITY DEFINER) estavam sem search_path fixo.
-- Só fixa o caminho de busca; o resultado delas não muda. Seguro repetir.
alter function public.add_business_days(timestamp with time zone, integer) set search_path = public, pg_temp;
alter function public.video_month_start() set search_path = public, pg_temp;

-- 0205 — Plano Plus, parte 1: o valor novo do tipo house_plan (decisão do proprietário, 24/11/2026: o vídeo é exclusivo do Plus).
-- O Postgres só deixa USAR um valor novo de enum depois que ele foi gravado, por isso o resto está na 0206.
alter type public.house_plan add value if not exists 'plus';

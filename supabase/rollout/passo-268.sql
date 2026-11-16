-- PASSO 268: 0125_vaga_extra_de_equipe — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) permissões
revoke all on function public.platform_seat_quote(uuid, date), public.platform_seat_issue(uuid, timestamptz), public.platform_seat_bought_by_payment(), public.platform_seat_refunded_flag(),
  public.platform_seat_release_apply_due(timestamptz), public.my_seat_release_schedule(int), public.my_seat_release_undo(), public.my_seat_status() from public, anon, authenticated;

grant execute on function public.platform_seat_issue(uuid, timestamptz), public.platform_seat_release_apply_due(timestamptz) to service_role;

grant execute on function public.my_seat_release_schedule(int), public.my_seat_release_undo(), public.my_seat_status() to authenticated, service_role;

revoke all on function public.admin_set_house_seats(uuid, int) from public, anon;

grant execute on function public.admin_set_house_seats(uuid, int) to authenticated;

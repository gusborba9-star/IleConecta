-- Pedido e convite de membro só existem para casas cujo plano inclui a área de membros (a mesma regra da lista de membros).
do $m$
declare def text; ndef text;
begin
  -- pedido da pessoa
  def := pg_get_functiondef('public.member_request_create(uuid)'::regprocedure);
  ndef := replace(def, E'  if not found then raise exception ''Casa não encontrada.''; end if;\n',
    E'  if not found then raise exception ''Casa não encontrada.''; end if;\n  if not public.plan_cap_bool(h.plan::text, ''members_area'') then raise exception ''Esta casa ainda não recebe pedidos de membro.''; end if;\n');
  if ndef = def then raise exception 'texto não encontrado em member_request_create'; end if;
  execute ndef;
  -- convite da casa
  def := pg_get_functiondef('public.member_request_invite(uuid)'::regprocedure);
  ndef := replace(def, E'  if p_user is null or p_user = uid',
    E'  if not public.plan_cap_bool(h.plan::text, ''members_area'') then raise exception ''A área de membros não está disponível no seu plano.''; end if;\n  if p_user is null or p_user = uid');
  if ndef = def then raise exception 'texto não encontrado em member_request_invite'; end if;
  execute ndef;
  -- estado (botões só aparecem quando a casa tem a área)
  def := pg_get_functiondef('public.member_request_between(uuid)'::regprocedure);
  ndef := replace(def, E'  if h.id is null then return null; end if;\n',
    E'  if h.id is null or not public.plan_cap_bool(h.plan::text, ''members_area'') then return null; end if;\n');
  if ndef = def then raise exception 'texto não encontrado em member_request_between'; end if;
  execute ndef;
end $m$;

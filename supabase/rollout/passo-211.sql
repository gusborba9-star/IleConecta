-- PASSO 211: 0111_plano_gratis — parte 2 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.plan_matrix_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare plan text; k text; v jsonb; b jsonb; t text;
  nums jsonb := '{"assistant_replies":[0,100000],"campaign_links":[0,200],"campaign_card_styles":[0,10],"quick_replies":[0,200],"included_seats":[0,20],"limit_services":[0,1000],"limit_rituals":[0,1000],"limit_posts_month":[0,1000]}';
  flags text[] := array['assistant_sells','assistant_discount','chat_media','members_area','calendar_full','campaign_daily_count','campaign_insights_full','ritual_video'];
  feats text[] := array['assistant','boost','highlight','payments','ritual_video','referral','reviews','calendar'];
begin
  if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(m) x) is distinct from array['caps', 'copy'] then return false; end if;
  foreach plan in array array['gratis', 'base', 'intermediario', 'maximo'] loop
    v := m -> 'caps' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 16 then return false; end if;
    for k in select jsonb_object_keys(nums) loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'number' then return false; end if;
      if (v ->> k) !~ '^[0-9]{1,6}$' then return false; end if;
      if (v ->> k)::int < (nums -> k ->> 0)::int or (v ->> k)::int > (nums -> k ->> 1)::int then return false; end if;
    end loop;
    foreach k in array flags loop
      if coalesce(jsonb_typeof(v -> k), '') <> 'boolean' then return false; end if;
    end loop;
    v := m -> 'copy' -> plan;
    if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
    if coalesce(jsonb_typeof(v -> 'tagline'), '') <> 'string' then return false; end if;
    if char_length(btrim(v ->> 'tagline')) not between 1 and 120 then return false; end if;
    if coalesce(jsonb_typeof(v -> 'benefits'), '') <> 'array' then return false; end if;
    if jsonb_array_length(v -> 'benefits') > 12 then return false; end if;
    for b in select jsonb_array_elements(v -> 'benefits') loop
      if coalesce(jsonb_typeof(b), '') <> 'object' then return false; end if;
      if coalesce(jsonb_typeof(b -> 'text'), '') <> 'string' then return false; end if;
      if char_length(btrim(b ->> 'text')) not between 1 and 200 then return false; end if;
      t := coalesce(jsonb_typeof(b -> 'feature'), 'null');
      if t = 'string' then
        if not ((b ->> 'feature') = any (feats)) then return false; end if;
      elsif t <> 'null' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- A matriz salva (ainda com 3 planos) deixou de ser válida: passa a valer a nova, aprovada pelo proprietário em 14/11/2026.
update public.platform_settings set value = public.plan_matrix_default(), updated_at = now() where key = 'plan_matrix';

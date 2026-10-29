-- O administrador define o plano de cada casa (inclusive período de degustação, com volta automática ao plano de antes).
-- Rode no SQL Editor. É seguro repetir.

alter table public.houses add column if not exists plan_revert_to public.house_plan;
alter table public.houses add column if not exists plan_revert_at timestamptz;

-- A casa nunca muda o próprio plano nem a volta programada: só o administrador (pela função abaixo) ou o servidor.
create or replace function public.protect_house_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and coalesce(current_setting('app.admin_plan', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.verified := false; new.plan := 'base'; new.plan_revert_to := null; new.plan_revert_at := null;
    else
      new.verified := old.verified; new.plan := old.plan;
      new.plan_revert_to := old.plan_revert_to; new.plan_revert_at := old.plan_revert_at;
    end if;
  end if;
  return new;
end $$;

-- Lista para o painel (só administrador).
create or replace function public.admin_houses_plans()
returns table (house_id uuid, name text, plan public.house_plan, revert_to public.house_plan, revert_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query select h.id, h.name, h.plan, h.plan_revert_to, h.plan_revert_at from public.houses h order by h.name;
end $$;
revoke execute on function public.admin_houses_plans() from public, anon;
grant execute on function public.admin_houses_plans() to authenticated;

-- Muda o plano. Com p_revert_at (degustação), a casa volta para p_revert_to na data (conferido de hora em hora).
create or replace function public.admin_set_house_plan(p_house uuid, p_plan public.house_plan, p_revert_to public.house_plan default null, p_revert_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare old_plan public.house_plan;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if (p_revert_to is null) <> (p_revert_at is null) then raise exception 'invalid_trial'; end if;
  if p_revert_at is not null and p_revert_at <= now() then raise exception 'trial_in_past'; end if;
  select plan into old_plan from public.houses where id = p_house;
  if not found then raise exception 'house_not_found'; end if;
  perform set_config('app.admin_plan', 'on', true);
  update public.houses set plan = p_plan, plan_revert_to = p_revert_to, plan_revert_at = p_revert_at where id = p_house;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'house_plan', jsonb_build_object('house', p_house, 'plan', old_plan),
            jsonb_build_object('house', p_house, 'plan', p_plan, 'revert_to', p_revert_to, 'revert_at', p_revert_at));
end $$;
revoke execute on function public.admin_set_house_plan(uuid, public.house_plan, public.house_plan, timestamptz) from public, anon;
grant execute on function public.admin_set_house_plan(uuid, public.house_plan, public.house_plan, timestamptz) to authenticated;

-- Fim da degustação: de hora em hora, as casas com prazo vencido voltam ao plano de antes.
create extension if not exists pg_cron;
select cron.unschedule('plan-trial-revert') where exists (select 1 from cron.job where jobname = 'plan-trial-revert');
select cron.schedule('plan-trial-revert', '5 * * * *', $job$
  update public.houses set plan = plan_revert_to, plan_revert_to = null, plan_revert_at = null
   where plan_revert_at is not null and plan_revert_at <= now()
$job$);

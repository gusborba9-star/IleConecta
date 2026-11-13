// Verificação LOCAL da migration 0102 (reativação no mesmo dia de um pagamento anterior).
// Reproduz o erro do teste do proprietário na base SEM a 0102 e confirma a correção na base COM a 0102.
// Uso: node supabase/verify/verify_0102.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"]];

async function scenario(name, max) {
  const { c: su, failed } = await freshDb(name, { with64: true, max });
  ok(`${name}: migrations aplicadas sem erro`, failed.length === 0, failed.join(" | "));
  await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
    grant execute on all functions in schema public to anon, authenticated, service_role;`);
  for (const [f, m] of PERMS) await su.query(part(f, m));
  const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
  const sv = (sql, p) => q(su, sql, p);
  const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
  const O = "b0100000-0000-0000-0000-00000000b001", H = "d0100000-0000-0000-0000-00000000d001";
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, "o@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa R','casa-r','maximo')", [H, O]);
  await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
  await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date-40,true)", [H]);
  let n = 0;
  const payReactivation = async () => {
    const id = await sv("select public.platform_reactivation_issue($1,'maximo') id", [H]);
    if (id.err) return { err: id.err };
    const cid = id.rows[0].id; const ref = `cs_${name}_${++n}`;
    await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [cid, ref]);
    const amt = (await sv("select amount_cents a from platform_charges where id=$1", [cid])).rows[0].a;
    const p = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amt]);
    return p.err ? { err: p.err } : { id: cid };
  };
  const cancel = () => as(O, (c) => q(c, "select public.my_cancel_subscription('agora') r"));
  const active = async () => (await sv("select active from house_billing_plan where house_id=$1", [H])).rows[0].active;
  // 1) cancela, reativa por pagamento, cancela de novo no MESMO dia e reativa outra vez
  let r = await cancel(); ok(`${name}: 1º cancelamento`, !r.err && (await active()) === false, r.err);
  r = await payReactivation(); ok(`${name}: 1ª reativação paga`, !r.err && (await active()) === true, r.err);
  r = await cancel(); ok(`${name}: 2º cancelamento no mesmo dia`, !r.err && (await active()) === false, r.err);
  r = await payReactivation();
  const second = { err: r.err, active: await active() };
  await su.end();
  return second;
}

const before = await scenario("vf0102_antes", 101);
ok("SEM a 0102 o erro do proprietário se reproduz (índice uma-fatura-por-período recusa)", !!before.err && /duplicate|unique|platform_charges_one_per_period/i.test(before.err), before.err);
const after = await scenario("vf0102_depois", 102);
ok("COM a 0102 a 2ª reativação no mesmo dia funciona e a casa volta", !after.err && after.active === true, after.err);

// o índice das faturas mensais continua protegendo contra duplicidade
const { c: su } = await freshDb("vf0102_idx", { with64: true, max: 102 });
const idx = await su.query("select indexdef from pg_indexes where indexname='platform_charges_one_per_period'");
ok("índice uma-fatura-por-período continua existindo", idx.rows.length === 1 && /period_start/.test(idx.rows[0].indexdef));
const def = (await su.query("select pg_get_functiondef('public.platform_reactivation_issue(uuid,text,timestamptz)'::regprocedure) d")).rows[0].d;
ok("fatura de reativação não tem período mensal", /v_amt, v_day, null, 'Reativação do plano'/.test(def));
await su.end();
console.log(`\n${total - bad}/${total} verificações passaram`);
process.exit(bad ? 1 : 0);

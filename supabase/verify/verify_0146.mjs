// Verificação LOCAL da migration 0146 (excluir post impulsionado depois do reembolso). Uso: node supabase/verify/verify_0146.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0146";
const { c: su, failed } = await freshDb(name, { with64: true, max: 145 });
ok("migrations 0001–0145 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0146_excluir_post_impulsionado_apos_reembolso.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0146 aplica e reaplica sem erro", e === null, e ?? "");
await su.query(`revoke execute on function public.post_delete_state(uuid) from public, anon, authenticated; revoke execute on function public.my_post_delete_states() from anon;
  revoke execute on function public.platform_promo_purchase(uuid,text,text,int,text,uuid,boolean), public.platform_promo_refund_begin(uuid,uuid,uuid,timestamptz), public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text), public.promotions_tick(timestamptz), public.promotion_deliver(uuid,timestamptz) from public, anon, authenticated`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
await sv(`update platform_settings set value = value || '{"boost":{"state":"on","beta_houses":[]},"highlight":{"state":"on","beta_houses":[]}}'::jsonb where key='features'`);
let seq = 0;
async function mk(plan = "maximo") {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0146000-0000-0000-0000-00000000${hex}`, H = `d0146000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `u${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city,state,country) values ($1,'casa','Pessoa','Salvador','BA','BR') on conflict (id) do update set account_type='casa', city='Salvador', state='BA', country='BR'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${i}`, `casa-${i}`, plan]);
  return { O, H };
}
const CL = "c0146000-0000-0000-0000-000000000001";
await su.query("insert into auth.users(id,email) values ($1,'cl@x.com')", [CL]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente','Cliente') on conflict (id) do nothing", [CL]);
const post = async (H, t = "Axé") => (await sv("insert into posts(house_id,kind,content) values ($1,'geral',$2) returning id", [H, t])).rows[0].id;
let pn = 0;
const buy = (H, days, post_id, scope = "cidade") => sv("select public.platform_promo_purchase($1,'boost',$2,$3,'post',$4,true) id", [H, scope, days, post_id]);
const pay = async (chargeId) => { const amt = (await sv("select amount_cents a from platform_charges where id=$1", [chargeId])).rows[0].a; const ref = `cs_promo_${++pn}`; await sv("select public.platform_charge_attach($1,'stripe',$2,'card',null)", [chargeId, ref]); const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,300)", [ref, amt]); if (r.err) throw new Error(r.err); };
const promo = async (ch) => (await sv("select * from promotions where charge_id=$1", [ch])).rows[0];
const state = async (p) => (await sv("select public.post_delete_state($1) s", [p])).rows[0].s;
const del = (uid, id) => as(uid, (c) => q(c, "delete from posts where id=$1", [id]));
const exists = async (id) => (await sv("select count(*)::int n from posts where id=$1", [id])).rows[0].n === 1;
const ago = (id, hours) => sv("update promotions set starts_at = starts_at - ($2||' hours')::interval, delivered_at = delivered_at - ($2||' hours')::interval where id=$1", [id, String(hours)]);
const boosted = async (H, days = 10) => { const P = await post(H); const bb = await buy(H, days, P); if (bb.err) throw new Error("compra: " + bb.err); const ch = bb.rows[0].id; await pay(ch); return { P, ch }; };
const A = await mk(), B = await mk();

// ---- sem impulsionamento
let P = await post(A.H); ok("sem impulsionamento: estado livre e exclui", await state(P) === "livre" && !(await del(A.O, P)).err && !(await exists(P)));
// ---- impulsionado, dentro dos 7 dias, com dias a reembolsar
let { P: P1, ch: c1 } = await boosted(A.H, 10);
ok("pago há instantes, 10 dias: 'reembolsavel'", await state(P1) === "reembolsavel", await state(P1));
let r = await del(A.O, P1);
ok("excluir antes do reembolso: recusado com a mensagem de sempre", /Você poderá excluí-la quando o impulsionamento terminar/.test(r.err ?? "") && await exists(P1), r.err);
// ---- reembolso pedido (pendente)
await ago((await promo(c1)).id, 25);
let b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, c1]);
ok("pedido de reembolso aberto (8 dias devolvidos, 2 já começaram)", !b.err && b.rows[0].r.days_refunded === 8, b.err);
ok("reembolso pendente: estado 'reembolso_pendente'", await state(P1) === "reembolso_pendente");
r = await del(A.O, P1); ok("…excluir é recusado com mensagem de espera", /ainda está sendo concluído/.test(r.err ?? "") && await exists(P1), r.err);
// ---- falha do provedor volta tudo
await sv("select public.platform_promo_refund_fail((select id from promo_refunds where charge_id=$1), 'recusado')", [c1]);
ok("estorno falhou: impulsionamento volta ao que era e o estado volta a 'reembolsavel'", (await promo(c1)).days === 10 && await state(P1) === "reembolsavel");
r = await del(A.O, P1); ok("…e a exclusão segue recusada", !!r.err && await exists(P1));
// ---- refaz e conclui
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, c1]);
ok("novo pedido", !b.err, b.err);
await sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1 and status='pendente'), 're_ok')", [c1]);
ok("reembolso concluído: estado 'liberado'", await state(P1) === "liberado");
const led0 = (await sv("select coalesce(sum(amount_cents),0)::int s from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [c1])).rows[0].s;
r = await del(B.O, P1); ok("outra casa não exclui", r.n === 0 && await exists(P1));
r = await del(CL, P1); ok("cliente não exclui", r.n === 0 && await exists(P1));
r = await del(A.O, P1);
ok("a casa dona exclui depois do reembolso concluído", !r.err && r.n === 1 && !(await exists(P1)), r.err);
const pr = await promo(c1);
ok("o impulsionamento fica registrado como 'encerrada' (a compra não some)", pr && pr.status === "encerrada");
const led1 = (await sv("select coalesce(sum(amount_cents),0)::int s from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [c1])).rows[0].s;
ok("dinheiro: excluir não gera nenhum estorno extra (os dias já iniciados não voltam)", led0 > 0 && led1 === led0);
ok("a compra continua com os 2 dias já iniciados (não vira devolução)", pr.days === 2);
// ---- depois de 7 dias não há reembolso: segue bloqueado
({ P: P, ch: c1 } = await boosted(A.H, 10));
const setPaid = async (id, iv) => { await su.query("alter table platform_charges disable trigger trg_platform_charges_guard"); const x = await sv(`update platform_charges set paid_at = now() - interval '${iv}' where id=$1`, [id]); await su.query("alter table platform_charges enable trigger trg_platform_charges_guard"); return x; };
const up8 = await setPaid(c1, "8 days");
ok("pago há 8 dias: 'aguardar' (sem reembolso)", await state(P) === "aguardar", `${up8.err ?? ""} ${await state(P)}`);
r = await del(A.O, P); ok("…exclusão recusada", /Você poderá excluí-la/.test(r.err ?? "") && await exists(P), r.err);
await setPaid(c1, "6 days 23 hours");
ok("pago há 6 dias e 23 h: ainda 'reembolsavel'", await state(P) === "reembolsavel");
// ---- 1 dia só: todos os dias já começaram
({ P, ch: c1 } = await boosted(A.H, 1));
ok("impulsionamento de 1 dia: nada a reembolsar → 'aguardar'", await state(P) === "aguardar");
// ---- compra ainda não paga (aguardando)
P = await post(A.H); await buy(A.H, 5, P);
ok("pedido ainda não pago (aguardando): 'aguardar'", await state(P) === "aguardar");
r = await del(A.O, P); ok("…exclusão recusada", !!r.err && await exists(P));
// ---- duas compras no mesmo post: precisa reembolsar as duas
P = await post(A.H); const k1 = (await buy(A.H, 6, P)).rows[0].id; await pay(k1); const k2 = (await buy(A.H, 4, P)).rows[0].id; await pay(k2);
ok("duas compras: 'reembolsavel'", await state(P) === "reembolsavel");
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, k2]); await sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1 and status='pendente'), 're_k2')", [k2]);
ok("só a segunda reembolsada: continua 'reembolsavel' (a primeira ainda tem dias)", await state(P) === "reembolsavel");
r = await del(A.O, P); ok("…e excluir segue recusado", !!r.err && await exists(P));
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, k1]); await sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1 and status='pendente'), 're_k1')", [k1]);
ok("as duas reembolsadas: 'liberado'", await state(P) === "liberado");
r = await del(A.O, P); ok("exclui e encerra todas as compras do post", !r.err && !(await exists(P)) && (await sv("select count(*)::int n from promotions where charge_id in ($1,$2) and status='encerrada'", [k1, k2])).rows[0].n >= 1, r.err);
// ---- a pergunta da tela
const Pa = await post(A.H, "A"), Pb = await post(A.H, "B"), Pl = await post(A.H, "L"), Px = await post(B.H, "X");
const ca = (await buy(A.H, 10, Pa)).rows[0].id; await pay(ca); const cb = (await buy(A.H, 1, Pb)).rows[0].id; await pay(cb); const cx = (await buy(B.H, 10, Px)).rows[0].id; await pay(cx);
const states = (uid) => as(uid, (c) => q(c, "select * from public.my_post_delete_states()"));
r = await states(A.O); const m = Object.fromEntries((r.rows ?? []).map((x) => [x.post_id, x]));
ok("a casa vê o estado dos próprios posts impulsionados", m[Pa]?.state === "reembolsavel" && m[Pb]?.state === "aguardar", r.err);
ok("post sem impulsionamento e post de outra casa não aparecem", !m[Pl] && !m[Px]);
const paid = (await sv("select paid_at from platform_charges where id=$1", [ca])).rows[0].paid_at;
ok("o prazo do reembolso só vem junto de 'reembolsavel' e é a data do pagamento + 7 dias", m[Pb]?.deadline === null && Math.abs(new Date(m[Pa].deadline) - (new Date(paid).getTime() + 7 * 86400000)) < 2000);
r = await states(B.O); ok("outra casa só vê o dela", (r.rows ?? []).length === 1 && r.rows[0].post_id === Px);
r = await states(CL); ok("cliente não vê nada", (r.rows ?? []).length === 0);
r = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select * from public.my_post_delete_states()"); } finally { await c.end(); } })(); ok("anon não consulta", !!r.err);
r = await as(A.O, (c) => q(c, "select public.post_delete_state($1)", [Pa])); ok("a função interna não é chamável por quem usa o app", !!r.err, r.err);
// ---- administração e cascata
r = await q(su, "delete from posts where id=$1", [Pa]); ok("SQL da administração (sem usuário) exclui mesmo impulsionado", !r.err && r.n === 1, r.err);
// ---- forma
const acl = await sv(`select (select bool_and(prosecdef) from pg_proc where proname in ('post_delete_state','my_post_delete_states','posts_delete_guard')) d,
  (select bool_and(coalesce(proconfig::text,'') like '%search_path=public%') from pg_proc where proname in ('post_delete_state','my_post_delete_states','posts_delete_guard')) c`);
ok("security definer com search_path fixo", acl.rows[0].d && acl.rows[0].c);
// ---- mutações
const g143 = readFileSync(new URL("../migrations/0143_trava_excluir_post_impulsionado.sql", import.meta.url), "utf8").match(/create or replace function public\.posts_delete_guard[\s\S]*?end \$\$;/)[0];
({ P, ch: c1 } = await boosted(A.H, 10)); await sv("select public.platform_promo_refund_begin($1,$2,null,now())", [A.H, c1]); await sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1 and status='pendente'), 're_m')", [c1]);
await su.query(g143); r = await del(A.O, P);
ok("MUTAÇÃO: com a trava antiga (0143) a exclusão após reembolso continuaria recusada (o teste distingue)", !!r.err && await exists(P));
await su.query(mig); await su.query("revoke execute on function public.post_delete_state(uuid) from public, anon, authenticated");
r = await del(A.O, P); ok("reaplicar a migration libera de novo", !r.err && !(await exists(P)), r.err);
// mutação 2: sem olhar o reembolso pendente, a exclusão passaria no meio do estorno
({ P, ch: c1 } = await boosted(A.H, 10)); await sv("select public.platform_promo_refund_begin($1,$2,null,now())", [A.H, c1]);
const fn = (await sv("select pg_get_functiondef('public.post_delete_state(uuid)'::regprocedure) d")).rows[0].d.replace("and r.status = 'pendente'", "and r.status = 'nunca'");
await su.query(fn);
ok("MUTAÇÃO: sem a checagem do reembolso pendente o estado mentiria ('liberado' antes do estorno terminar)", await state(P) !== "reembolso_pendente");
await su.query(mig); await su.query("revoke execute on function public.post_delete_state(uuid) from public, anon, authenticated");
ok("reaplicar restaura 'reembolso_pendente'", await state(P) === "reembolso_pendente");
console.log(`\n${total - bad}/${total} ok`); await su.end(); process.exit(bad ? 1 : 0);

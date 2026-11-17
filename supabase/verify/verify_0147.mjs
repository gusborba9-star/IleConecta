// Verificação LOCAL da migration 0147 ("cancelar agora" exclui a publicação). Uso: node supabase/verify/verify_0147.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0147";
const { c: su, failed } = await freshDb(name, { with64: true, max: 146 });
ok("migrations 0001–0146 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0147_cancelar_agora_exclui_publicacao.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0147 aplica e reaplica sem erro", e === null, e ?? "");
await su.query(`revoke execute on function public.post_delete_state(uuid) from public, anon, authenticated; revoke execute on function public.my_post_delete_states() from anon; revoke execute on function public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text) from public, anon, authenticated; revoke execute on function public.house_set_post_delete_after_refund(uuid,boolean) from anon;
  revoke execute on function public.platform_promo_purchase(uuid,text,text,int,text,uuid,boolean), public.platform_promo_refund_begin(uuid,uuid,uuid,timestamptz), public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text), public.promotions_tick(timestamptz), public.promotion_deliver(uuid,timestamptz) from public, anon, authenticated`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
await sv(`update platform_settings set value = value || '{"boost":{"state":"on","beta_houses":[]},"highlight":{"state":"on","beta_houses":[]}}'::jsonb where key='features'`);
let seq = 0;
async function mk(plan = "maximo") {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0147000-0000-0000-0000-00000000${hex}`, H = `d0147000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `u${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city,state,country) values ($1,'casa','Pessoa','Salvador','BA','BR') on conflict (id) do update set account_type='casa', city='Salvador', state='BA', country='BR'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${i}`, `casa-${i}`, plan]);
  return { O, H };
}
const CL = "c0147000-0000-0000-0000-000000000001";
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

const flag = (uid, ch, on = true) => as(uid, (c) => q(c, "select public.house_set_post_delete_after_refund($1,$2)", [ch, on]));
const begin = (H, ch) => sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [H, ch]);
const done = (ch) => sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1 and status='pendente'), 're_'||$1::text) r", [ch]);
const fail = (ch) => sv("select public.platform_promo_refund_fail((select id from promo_refunds where charge_id=$1 and status='pendente'), 'recusado')", [ch]);
const ledger = async (ch) => (await sv("select coalesce(sum(amount_cents),0)::int s from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [ch])).rows[0].s;
const notes = async (O) => (await sv("select text from notifications where user_id=$1 order by created_at", [O])).rows.map((x) => x.text);


// ---- marcar o pedido
let { P, ch } = await boosted(A.H, 10);
let r = await flag(B.O, ch); ok("outra casa não marca compra alheia", /sua casa/.test(r.err ?? ""), r.err);
r = await flag(CL, ch); ok("cliente não marca", !!r.err, r.err);
r = await as(null, (c) => q(c, "select public.house_set_post_delete_after_refund($1,true)", [ch])); ok("sem login: recusado", !!r.err, r.err);
r = await flag(A.O, "00000000-0000-0000-0000-000000000999"); ok("compra inexistente: recusado sem vazar nada", /sua casa/.test(r.err ?? ""), r.err);
r = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select public.house_set_post_delete_after_refund($1,true)", [ch]); } finally { await c.end(); } })(); ok("anon não chama", !!r.err);
r = await flag(A.O, ch, null); ok("valor nulo recusado", /Informe/.test(r.err ?? ""), r.err);
// compra que não é de publicação
const svc = (await sv("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'trabalho','Amor','Descrição longa o suficiente para o serviço ser válido.',10000,true) returning id", [A.H])).rows[0].id;
const cs = (await sv("select public.platform_promo_purchase($1,'boost','cidade',5,'service',$2,true) id", [A.H, svc])).rows[0].id; await pay(cs);
r = await flag(A.O, cs); ok("compra de serviço/ritual/destaque não aceita o pedido de excluir", /não é de uma publicação/.test(r.err ?? ""), r.err);
// escrita direta
r = await as(A.O, (c) => q(c, "update promotions set delete_post_after_refund=true where charge_id=$1", [ch])); ok("a casa não altera a marca por escrita direta", r.n === 0 || !!r.err);

// ---- fluxo completo: cancelar agora
await ago((await promo(ch)).id, 25);
r = await flag(A.O, ch); ok("a casa dona marca 'excluir depois do reembolso'", !r.err, r.err);
r = await begin(A.H, ch); ok("pedido de reembolso aberto (8 dias)", !r.err && r.rows[0].r.days_refunded === 8, r.err);
ok("reembolso pendente: a publicação ainda NÃO foi excluída", await exists(P) && await state(P) === "reembolso_pendente");
r = await done(ch); ok("estorno confirmado", !r.err, r.err);
ok("…e a publicação foi excluída", !(await exists(P)));
const p1 = await promo(ch);
ok("a compra fica 'encerrada' com os 2 dias já iniciados (pagos, não devolvidos)", p1.status === "encerrada" && p1.days === 2, JSON.stringify([p1.status, p1.days]));
const ledgerA = await ledger(ch);
ok("dinheiro: só os 8 dias foram estornados; excluir não gera estorno extra", ledgerA > 0 && ledgerA < (await sv("select paid_amount_cents a from platform_charges where id=$1", [ch])).rows[0].a);
ok("aviso à casa da exclusão", (await notes(A.O)).some((t) => /publicação foi excluída, como você pediu/.test(t)));

// ---- sem a marca: o reembolso não exclui
({ P, ch } = await boosted(A.H, 10)); await ago((await promo(ch)).id, 25); await begin(A.H, ch); await done(ch);
ok("sem a marca, o reembolso concluído NÃO exclui (fica 'liberado')", await exists(P) && await state(P) === "liberado");
// ---- estorno falha: nada é excluído e a marca some
({ P, ch } = await boosted(A.H, 10)); await ago((await promo(ch)).id, 25); await flag(A.O, ch); await begin(A.H, ch); await fail(ch);
ok("estorno falhou: publicação fica e a compra volta ao que era", await exists(P) && (await promo(ch)).days === 10 && await state(P) === "reembolsavel");
ok("…e a marca de excluir foi desfeita", (await promo(ch)).delete_post_after_refund === false);
await begin(A.H, ch); await done(ch);
ok("tentar de novo pelo botão antigo (sem marca) não exclui", await exists(P));
// ---- desmarcar (o cliente desistiu / o pedido não saiu)
({ P, ch } = await boosted(A.H, 10)); await ago((await promo(ch)).id, 25); await flag(A.O, ch); await flag(A.O, ch, false);
await begin(A.H, ch); await done(ch); ok("marca desfeita: o reembolso não exclui", await exists(P));
// ---- duas compras no mesmo post
P = await post(A.H); const k1 = (await buy(A.H, 6, P)).rows[0].id; await pay(k1); const k2 = (await buy(A.H, 4, P)).rows[0].id; await pay(k2);
await flag(A.O, k1); await begin(A.H, k1); await done(k1);
ok("duas compras: reembolsada só a primeira, a publicação FICA (a segunda ainda tem dias pagos)", await exists(P) && await state(P) === "reembolsavel");
await begin(A.H, k2); await done(k2);
ok("a última compra reembolsada leva a publicação junto (o pedido foi feito na primeira)", !(await exists(P)));
ok("as duas compras ficam registradas", (await sv("select count(*)::int n from promotions where charge_id in ($1,$2)", [k1, k2])).rows[0].n === 2);
// ---- a segunda compra não iniciada (somada): marca na segunda, primeira já tratada
P = await post(A.H); const m1 = (await buy(A.H, 6, P)).rows[0].id; await pay(m1); const m2 = (await buy(A.H, 4, P)).rows[0].id; await pay(m2);
await begin(A.H, m1); await done(m1); ok("primeira reembolsada sem marca: publicação fica", await exists(P));
await flag(A.O, m2); await begin(A.H, m2); await done(m2);
ok("segunda (nenhum dia começou: devolução integral) com marca: publicação excluída", !(await exists(P)));
// ---- compra de 1 dia: nada a reembolsar, o pedido falha e a marca é desfeita pela tela
({ P, ch } = await boosted(A.H, 1)); await flag(A.O, ch); const b0 = await begin(A.H, ch);
ok("1 dia: pedido de reembolso recusado ('todos os dias já começaram') e a publicação fica", /já começaram/.test(b0.err ?? "") && await exists(P));
await flag(A.O, ch, false); ok("a tela desmarca depois da recusa", (await promo(ch)).delete_post_after_refund === false);
// ---- post de outra casa nunca é tocado
const PO = await post(B.H); const cb = (await buy(B.H, 10, PO)).rows[0].id; await pay(cb);
const PA = await post(A.H); const ca = (await buy(A.H, 10, PA)).rows[0].id; await pay(ca); await flag(A.O, ca); await begin(A.H, ca); await done(ca);
ok("o post de outra casa não é afetado", await exists(PO) && !(await exists(PA)));
// ---- forma
const acl = await sv(`select has_function_privilege('anon','public.house_set_post_delete_after_refund(uuid,boolean)','execute') a, has_function_privilege('authenticated','public.house_set_post_delete_after_refund(uuid,boolean)','execute') u,
  has_function_privilege('authenticated','public.platform_promo_refund_done(uuid,text,timestamptz)','execute') d,
  (select bool_and(prosecdef) from pg_proc where proname in ('house_set_post_delete_after_refund','platform_promo_refund_done','platform_promo_refund_fail')) sd,
  (select bool_and(coalesce(proconfig::text,'') like '%search_path=public%') from pg_proc where proname in ('house_set_post_delete_after_refund','platform_promo_refund_done','platform_promo_refund_fail')) cfg`);
ok("ACL: marca só para logados; concluir/falhar reembolso continuam fechados; security definer com search_path fixo", !acl.rows[0].a && acl.rows[0].u && !acl.rows[0].d && acl.rows[0].sd && acl.rows[0].cfg);
// ---- mutações
const orig = (await sv("select pg_get_functiondef('public.platform_promo_refund_done(uuid,text,timestamptz)'::regprocedure) d")).rows[0].d;
await su.query(orig.replace("and public.post_delete_state(pr.item_id) in ('livre', 'liberado')", "and false"));
({ P, ch } = await boosted(A.H, 10)); await ago((await promo(ch)).id, 25); await flag(A.O, ch); await begin(A.H, ch); await done(ch);
ok("MUTAÇÃO: sem a exclusão no 'concluído' a publicação ficaria (o teste detecta)", await exists(P));
await su.query(mig); await su.query("revoke execute on function public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text) from public, anon, authenticated");
// mutação 2: sem conferir as outras compras, a exclusão levaria dinheiro pago
await su.query(orig.replace("and public.post_delete_state(pr.item_id) in ('livre', 'liberado')", ""));
P = await post(A.H); const z1 = (await buy(A.H, 6, P)).rows[0].id; await pay(z1); const z2 = (await buy(A.H, 4, P)).rows[0].id; await pay(z2);
await flag(A.O, z1); await begin(A.H, z1); await done(z1);
ok("MUTAÇÃO: sem checar o estado, a publicação seria excluída com a segunda compra ainda paga (o teste detecta)", !(await exists(P)));
await su.query(mig); await su.query("revoke execute on function public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text) from public, anon, authenticated");
P = await post(A.H); const y1 = (await buy(A.H, 6, P)).rows[0].id; await pay(y1); const y2 = (await buy(A.H, 4, P)).rows[0].id; await pay(y2);
await flag(A.O, y1); await begin(A.H, y1); await done(y1);
ok("reaplicar a migration restaura a proteção da segunda compra", await exists(P));
console.log(`\n${total - bad}/${total} ok`); await su.end(); process.exit(bad ? 1 : 0);

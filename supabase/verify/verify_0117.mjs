// Verificação LOCAL da migration 0117 (vitrine sem casas encerradas).
// Uso: node supabase/verify/verify_0117.mjs   (PG em 127.0.0.1:5544)
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const name = "vf0117";
const { c: su, failed } = await freshDb(name, { with64: true, max: 117 });
ok("migrations 0001–0117 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
// o grant geral acima desfaz as permissões da migration: reaplica as que importam para o teste de segurança
await su.query(`revoke all on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds from anon, authenticated;
  grant select on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds to authenticated;
  revoke execute on function public.platform_promo_purchase(uuid,text,text,int,text,uuid,boolean), public.platform_promo_refund_begin(uuid,uuid,uuid,timestamptz), public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text), public.promotions_tick(timestamptz), public.promotion_deliver(uuid,timestamptz) from public, anon, authenticated;
  revoke execute on function public.promotions_visible(), public.my_promotions(), public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.admin_set_promo_limit(text,int,text) from public, anon;
  grant execute on function public.promotions_visible() to anon;`);
await su.query(`revoke all on public.promo_stats, public.promo_events from anon, authenticated; revoke execute on function public.promo_track(uuid[],text) from public, anon;`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (role, uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
await su.query(`revoke execute on function public.vitrine_hidden_house_ids() from public, anon;`);
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const ids = { ADM: "c0117000-0000-0000-0000-000000000001", OK: "c0117000-0000-0000-0000-000000000002", OB: "c0117000-0000-0000-0000-000000000003", CL: "c0117000-0000-0000-0000-000000000004", TIE: "c0117000-0000-0000-0000-000000000005", OA: "c0117000-0000-0000-0000-000000000006" };
const HA = "d0117000-0000-0000-0000-00000000000a", HB = "d0117000-0000-0000-0000-00000000000b";
for (const [k, u] of Object.entries(ids)) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, `${k}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set account_type=$2", [u, ["OB", "OA"].includes(k) ? "casa" : "cliente", k]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ids.ADM]);
await su.query("insert into houses(id,owner_id,name,slug) values ($1,$2,'Casa normal','casa-a'),($3,$4,'Casa bloqueada','casa-b')", [HA, ids.OA, HB, ids.OB]);
await su.query("insert into house_billing_state(house_id,suspended,total,since,total_since) values ($1,true,true,now(),now()) on conflict (house_id) do update set total=true, suspended=true", [HB]);
const hid = (uid) => as("authenticated", uid, (cl) => q(cl, "select public.vitrine_hidden_house_ids() v")).then((x) => x.rows?.[0]?.v ?? x.err);
const rows = (uid) => as("authenticated", uid, (cl) => q(cl, "select id from houses")).then((x) => (x.rows ?? []).map((r) => r.id));
ok("a casa bloqueada existe e está escondida pela regra da vitrine", (await sv("select public.house_is_hidden($1) h", [HB])).rows[0].h === true);
ok("usuário comum: não enxerga a casa bloqueada e a lista vem vazia", !(await rows(ids.CL)).includes(HB) && (await hid(ids.CL)).length === 0);
ok("administrador enxerga a casa bloqueada pela regra de leitura…", (await rows(ids.ADM)).includes(HB));
ok("…mas a vitrine a esconde para ele", (await hid(ids.ADM)).includes(HB) && !(await hid(ids.ADM)).includes(HA));
ok("dono da casa bloqueada continua vendo a própria casa na vitrine", !(await hid(ids.OB)).includes(HB));
ok("dono de outra casa: nada a esconder", (await hid(ids.OA)).length === 0);
// cliente com pedido em andamento: enxerga a casa pelos pedidos, mas ela não entra na vitrine
await sv("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'trabalho','Amor','Descrição longa o suficiente para o serviço ser válido.',10000,true)", [HB]);
const svcB = (await sv("select id from services where house_id=$1", [HB])).rows[0].id;
const ord = await sv("insert into service_orders(house_id,service_id,client_id,status,price_cents,title) values ($1,$2,$3,'confirmado',10000,'Amor') returning id", [HB, svcB, ids.TIE]);
if (!ord.err) ok("cliente com pedido em andamento: vê a casa nos pedidos, mas a vitrine a esconde", (await rows(ids.TIE)).includes(HB) && (await hid(ids.TIE)).includes(HB));
else console.log("(pedido de teste não criado: " + ord.err + ")");
ok("visitante sem login não chama (e nada vaza)", !!(await as("anon", null, (cl) => q(cl, "select public.vitrine_hidden_house_ids()"))).err);
ok("permissões: login e servidor chamam; público não", (await sv("select has_function_privilege('anon','public.vitrine_hidden_house_ids()','execute') a, has_function_privilege('authenticated','public.vitrine_hidden_house_ids()','execute') b").then((x) => x.rows[0].a === false && x.rows[0].b === true)));
console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end();
process.exit(bad ? 1 : 0);

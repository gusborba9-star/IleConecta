// Verificação LOCAL da migration 0116 (venda de destaque e impulsionamento).
// Uso: node supabase/verify/verify_0116.mjs   (PG em 127.0.0.1:5544)
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const name = "vf0116";
const { c: su, failed } = await freshDb(name, { with64: true, max: 116 });
ok("migrations 0001–0116 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
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
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
await sv(`update platform_settings set value = value || '{"boost":{"state":"on","beta_houses":[]},"highlight":{"state":"on","beta_houses":[]}}'::jsonb where key='features'`);

let seq = 0;
async function mk(city = "Salvador", state = "BA", plan = "intermediario") {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0116000-0000-0000-0000-00000000${hex}`, H = `d0116000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `u${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city,state,country) values ($1,'casa','Pessoa',$2,$3,'BR') on conflict (id) do update set account_type='casa', city=$2, state=$3, country='BR'", [O, city, state]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${i}`, `casa-${i}`, plan]);
  return { O, H };
}
const svc = async (H, title = "Amor") => (await sv("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'trabalho',$2,'Descrição longa o suficiente para o serviço ser válido.',10000,true) returning id", [H, title])).rows[0].id;
const evt = async (H, days = 30) => { const r = await sv("insert into events(house_id,title,description,price_cents,seats_total,starts_at,ends_at,duration_min,status) values ($1,'Ritual de teste','Descrição do ritual de teste.',5000,20,now()+($2||' days')::interval,now()+($2||' days')::interval+interval '2 hours',120,'publicado') returning id", [H, String(days)]); if (r.err) throw new Error("evento: " + r.err); return r.rows[0].id; };
let pn = 0;
const buy = (H, kind, scope, days, itype = null, item = null, auth = true) => sv("select public.platform_promo_purchase($1,$2,$3,$4,$5,$6,$7) id", [H, kind, scope, days, itype, item, auth]);
const pay = async (chargeId) => {
  const amt = (await sv("select amount_cents a from platform_charges where id=$1", [chargeId])).rows[0].a;
  const ref = `cs_promo_${++pn}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'card',null)", [chargeId, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,300)", [ref, amt]);
  if (r.err) throw new Error(r.err);
  return Number(amt);
};
const ago = (id, hours) => sv("update promotions set starts_at = starts_at - ($2||' hours')::interval where id=$1", [id, String(hours)]);
const promo = async (chargeId) => (await sv("select * from promotions where charge_id=$1", [chargeId])).rows[0];
const vis = async (uid) => (uid ? as("authenticated", uid, (cl) => q(cl, "select public.promotions_visible() v")) : as("anon", null, (cl) => q(cl, "select public.promotions_visible() v"))).then((x) => x.rows?.[0]?.v ?? x.err);
const view = (v, kind) => (Array.isArray(v) ? v.filter((i) => i.kind === kind) : []);
const post = async (H, kind = "geral", text = "Publicação de teste da casa") => (await sv("insert into posts(house_id,kind,content) values ($1,$2::post_kind,$3) returning id", [H, kind, text])).rows[0].id;
const stats = async (id) => (await sv("select coalesce(sum(views),0)::int v, coalesce(sum(opens),0)::int o from promo_stats where promotion_id=$1", [id])).rows[0];
const track = (uid, ids, kind) => as("authenticated", uid, (cl) => q(cl, "select public.promo_track($1::uuid[], $2) n", [ids, kind]));
const mine = (uid) => as("authenticated", uid, (cl) => q(cl, "select public.my_promotions() m")).then((x) => x.rows?.[0]?.m ?? x.err);

// ---------- impulso de publicação ----------
const A = await mk("Salvador", "BA"), B = await mk("Salvador", "BA"), V = await mk("Salvador", "BA"), V2 = await mk("Recife", "PE");
const p1 = await post(A.H), pStory = await post(A.H, "story"), pOther = await post(B.H);
let r = await buy(A.H, "boost", "cidade", 3, "post", p1);
ok("publicação da própria casa pode ser impulsionada", !r.err && r.rows[0].id, r.err);
const chP = r.rows[0].id;
ok("preço = 19,90 x 3 dias, calculado no servidor", Number((await sv("select amount_cents a from platform_charges where id=$1", [chP])).rows[0].a) === 5970);
r = await buy(A.H, "boost", "cidade", 3, "post", pOther);
ok("publicação de OUTRA casa é recusada", /publicações da sua casa/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 3, "post", pStory);
ok("momento (story) não é impulsionável", /publicações da sua casa/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 3, null, null);
ok("sem item é recusado com a mensagem nova", /serviço, ritual ou publicação/.test(r.err ?? ""), r.err);
await pay(chP);
const pr1 = await promo(chP);
ok("pago: ativa, do tipo publicação", pr1.status === "ativa" && pr1.item_type === "post" && pr1.item_id === p1);
r = await buy(A.H, "boost", "cidade", 2, "post", p1); await pay(r.rows[0].id);
ok("segunda compra da MESMA publicação soma no fim", (await promo(r.rows[0].id)).starts_at.getTime() > Date.now() + 2.5 * 86400000);
const v1 = await vis(V.O);
ok("quem mora na cidade vê a publicação impulsionada, com o código da compra", view(v1, "boost").some((i) => i.item_type === "post" && i.item_id === p1 && i.id === pr1.id));
ok("quem mora em outra cidade não vê", !view(await vis(V2.O), "boost").some((i) => i.item_id === p1));
await sv("delete from posts where id=$1", [p1]);
ok("publicação apagada some do impulso", !view(await vis(V.O), "boost").some((i) => i.item_id === p1));
const p2 = await post(A.H); r = await buy(A.H, "boost", "cidade", 5, "post", p2); await pay(r.rows[0].id); const pr2 = await promo(r.rows[0].id);

// ---------- resultados ----------
r = await track(V.O, [pr2.id], "view");
ok("aparição de quem está no alcance conta 1", r.rows?.[0]?.n === 1 && (await stats(pr2.id)).v === 1, r.err);
r = await track(V.O, [pr2.id], "view");
ok("a mesma pessoa no mesmo dia não conta de novo", r.rows?.[0]?.n === 0 && (await stats(pr2.id)).v === 1);
r = await track(V.O, [pr2.id], "open");
ok("abertura conta à parte, uma vez", r.rows?.[0]?.n === 1 && (await stats(pr2.id)).o === 1);
const V3 = await mk("Salvador", "BA");
await track(V3.O, [pr2.id], "view");
ok("outra pessoa soma", (await stats(pr2.id)).v === 2);
r = await track(V2.O, [pr2.id], "view");
ok("quem está fora do alcance não conta (e não dá para forjar)", r.rows?.[0]?.n === 0 && (await stats(pr2.id)).v === 2);
r = await track(A.O, [pr2.id], "view");
ok("a própria casa não conta nas suas aparições", r.rows?.[0]?.n === 0 && (await stats(pr2.id)).v === 2);
r = await track(V.O, ["00000000-0000-0000-0000-000000000001"], "view");
ok("código inexistente é ignorado", r.rows?.[0]?.n === 0);
r = await track(V.O, [pr2.id], "click");
ok("tipo inválido recusado", !!r.err);
r = await track(V.O, Array.from({ length: 51 }, (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`), "view");
ok("mais de 50 itens de uma vez é recusado", !!r.err);
r = await as("anon", null, (cl) => q(cl, "select public.promo_track($1::uuid[], 'view') n", [[pr2.id]]));
ok("visitante sem login não consegue gravar", !!r.err || r.rows?.[0]?.n === 0);
await sv("update promotions set status='encerrada' where id=$1", [pr2.id]);
r = await track(V3.O, [pr2.id], "open");
ok("compra encerrada não recebe mais contagem", r.rows?.[0]?.n === 0);
await sv("update promotions set status='ativa' where id=$1", [pr2.id]);
const m = await mine(A.O); const it = m.items.find((x) => x.id === pr2.id);
ok("a casa vê as aparições e aberturas somadas na sua compra", it && it.views === 2 && it.opens === 1, JSON.stringify(it));
ok("o título da publicação aparece na lista da casa", /Publicação de teste/.test(it?.title ?? ""), it?.title);
ok("outra casa não enxerga os resultados alheios", !((await mine(B.O)).items ?? []).some((x) => x.id === pr2.id));
r = await as("authenticated", V.O, (cl) => q(cl, "select * from promo_stats")); ok("ninguém lê as tabelas de contagem direto", !!r.err);
r = await as("authenticated", V.O, (cl) => q(cl, "select * from promo_events")); ok("nem o registro de quem viu", !!r.err);
r = await as("authenticated", V.O, (cl) => q(cl, "insert into promo_stats(promotion_id,day,views) values ($1,current_date,999)", [pr2.id])); ok("e ninguém inventa números", !!r.err);
// o registro de quem viu é apagado no dia seguinte; os totais ficam
await sv("update promo_events set day = day - 2");
await sv("select public.promotions_tick()");
ok("rotina apaga o registro de quem viu e mantém o total", (await sv("select count(*)::int n from promo_events")).rows[0].n === 0 && (await stats(pr2.id)).v === 2);
// destaque da casa também conta
const hc = await buy(B.H, "highlight", "cidade", 3); await pay(hc.rows[0].id); const hp = await promo(hc.rows[0].id);
await track(V.O, [hp.id], "view"); await track(V.O, [hp.id], "open");
ok("destaque também registra aparição e abertura", (await stats(hp.id)).v === 1 && (await stats(hp.id)).o === 1);
// permissões
r = await as("authenticated", V.O, (cl) => q(cl, "select public.platform_promo_purchase($1,'boost','cidade',3,'post',$2,true)", [A.H, p2])); ok("a casa continua sem chamar a compra direto", !!r.err);
ok("permissões do rastreio: login e servidor chamam; público não", (await sv("select has_function_privilege('anon','public.promo_track(uuid[],text)','execute') a, has_function_privilege('authenticated','public.promo_track(uuid[],text)','execute') b").then((x) => x.rows[0].a === false && x.rows[0].b === true)));

console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end();
process.exit(bad ? 1 : 0);

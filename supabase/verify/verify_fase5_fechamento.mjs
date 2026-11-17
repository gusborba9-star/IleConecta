// Fechamento da Fase 5: prova de isolamento entre casas, reprodutibilidade e leitura sem alteração em TODAS as funções da fase.
// Uso: node supabase/verify/verify_fase5.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vffase5";
const { c: su, failed } = await freshDb(name, { with64: true, max: 136 });
ok("migrations 0001–0136 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to authenticated, service_role;`);
// Mutação (só para provar que a bateria detecta vazamento): aplica um SQL alterado por cima das migrations.
if (process.env.MUT_FILE) { try { await su.query(readFileSync(process.env.MUT_FILE, "utf8")); } catch (e) { console.log("MUT ERR", e.message); process.exit(2); } }
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 160)); return r; };
const uuid = (p, i) => `${p}0f50000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const T = (h) => `now() - interval '${h} hours'`;
const D = (d) => `now() - interval '${d} days'`;
// ---- duas casas simétricas (A e B), uma pessoa compartilhada (S) e clientes exclusivos de cada uma
const ADM = uuid("a", 1), OA = uuid("a", 2), OB = uuid("a", 3), SA = uuid("e", 1), CA1 = uuid("c", 1), CB1 = uuid("c", 2), CS = uuid("c", 3), NOB = uuid("f", 1);
const HA = uuid("d", 1), HB = uuid("d", 2);
const mk = async (id, t, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(/\W/g, "")}${id.slice(-3)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict do nothing", [id, t, nm]); };
for (const [id, t, nm] of [[ADM, "cliente", "Admin"], [OA, "casa", "Dona A"], [OB, "casa", "Dona B"], [SA, "cliente", "Equipe A"], [CA1, "cliente", "Cliente A"], [CB1, "cliente", "Cliente B"], [CS, "cliente", "Cliente Compartilhado"], [NOB, "cliente", "Sem Casa"]]) await mk(id, t, nm);
await su.query("insert into admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','maximo'),($3,$4,'Casa B','casa-b','maximo')", [HA, OA, HB, OB]);
await su.query("insert into house_staff(house_id,user_id,name,active,perms) values ($1,$2,'Equipe A',true,'{chat_read,chat_reply,orders,members,stats}')", [HA, SA]);
await force(`update houses set created_at = ${D(100)}`);
await force(`update profiles set created_at = ${D(50)}`);

let seq = 0;
const seed = async (H, O, CX) => {
  const ids = [H, O, CX];
  const note = (r) => { const x = r.rows?.[0]?.id; if (x) ids.push(x); return x; };
  await force(`insert into follows(follower_id,house_id,created_at) values ($1,$2,${D(10)}),($3,$2,${D(8)})`, [CX, H, CS]);
  for (const C of [CX, CS]) {
    const cid = (await su.query("insert into conversations default values returning id")).rows[0].id; ids.push(cid);
    await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [cid, O, C]);
    await force(`insert into messages(conversation_id,sender_id,text,created_at) values ($1,$2,'oi',${T(30)})`, [cid, C]);
  }
  const hand = (await su.query("insert into conversations default values returning id")).rows[0].id; ids.push(hand);
  await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [hand, O, CX]);
  await force(`insert into conversation_handoff(conversation_id,house_owner_id,state,reason,since,updated_at) values ($1,$2,'pendente','Assunto delicado',${T(13)},${T(13)})`, [hand, O]);
  const ordIds = [];
  for (const [C, st] of [[CX, "confirmado"], [CS, "concluido"], [CX, "concluido"]]) {
    const o = note(await force(`insert into service_orders(house_id,client_id,title,price_cents,status,updated_at) values ($1,$2,'Trabalho de limpeza',5000,$3,${T(60)}) returning id`, [H, C, st])); ordIds.push(o);
    note(await force(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',5000,'confirmado','v2-2026-10',500,now() - interval '3 days','pix') returning id`, [o]));
  }
  note(await force(`insert into reviews(house_id,author_id,rating,comment,service_order_id,created_at) values ($1,$2,4,'Bom',$3,${T(30)}) returning id`, [H, CS, ordIds[1]]));
  note(await force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status,created_at) values (gen_random_uuid(),$1,$2,$3,'antes_do_inicio','Motivo do pedido de teste',1000,'pendente',${T(60)}) returning id`, [ordIds[0], H, CX]));
  const c1 = note(await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,pix_discount_cents,created_at,updated_at) values ($1,'extra_seat','k','Vaga adicional',3990,current_date - ${++seq},current_date + 3,'aberta',$2,0,now(),now()) returning id`, [H, `idem-f5-${seq}-abcdefg`]));
  note(await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,paid_at,paid_amount_cents,pix_discount_cents,created_at,updated_at) values ($1,'plan','k','Plano',8990,current_date - ${++seq},current_date,'paga',$2,${D(5)},8990,0,${D(6)},${D(6)}) returning id`, [H, `idem-f5-${seq}-abcdefg`]));
  const m = note(await force(`insert into house_members(house_id,display_name,bond,monthly_cents,due_day,start_month) values ($1,'Membro','filho',5000,5,(date_trunc('month', current_date) - interval '3 months')::date) returning id`, [H]));
  note(await force(`insert into member_dues(member_id,house_id,month,amount_cents,due_date,status) values ($1,$2,(date_trunc('month', current_date) - interval '1 month')::date,5000,current_date - 5,'aberta') returning id`, [m, H]));
  note(await force(`insert into support_cases(kind,priority,status,opened_by,house_id,title,description,first_response_due,created_at) values ('duvida','normal','aguardando_pessoa',$2,$1,'Caso da casa','Descrição suficientemente longa do caso.',now() + interval '1 day',${D(2)}) returning id`, [H, O]));
  note(await force(`insert into moderation_flags(house_id,target_table,target_id,reason,excerpt,status,created_at,deadline_at) values ($1,'services',gen_random_uuid(),'promessa','Cura garantida','orientada',${T(100)},${T(10)}) returning id`, [H]));
  return new Set(ids.filter(Boolean));
};
const idsA = await seed(HA, OA, CA1), idsB = await seed(HB, OB, CB1);
ok("sementes completas nas duas casas", idsA.size >= 18 && idsB.size >= 18, `${idsA.size}/${idsB.size}`);
const SHARED = new Set([CS]);
const mine = (S, O) => new Set([...S].filter((x) => !O.has(x)));
const onlyA = mine(idsA, idsB), onlyB = mine(idsB, idsA);
const UUIDRE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const uuidsOf = (r) => new Set((JSON.stringify(r).match(UUIDRE) ?? []).map((x) => x.toLowerCase()));
const leaks = (out, forbidden) => [...uuidsOf(out)].filter((x) => forbidden.has(x));
const hits = (out, allowed) => [...uuidsOf(out)].filter((x) => allowed.has(x)).length;

// ---- funções da casa: titular A, equipe de A e titular B
const house = {
  "central de pendências": (c) => q(c, "select public.house_pending_center() r"),
  "pessoas": (c) => q(c, "select public.house_people('todos', null, 200, 0) r"),
  "indicadores": (c) => q(c, "select public.house_indicators(30) r"),
};
const personTl = (uid, person) => as(uid, (c) => q(c, "select public.house_person_timeline($1) r", [person]));
const forbidA = new Set([...onlyB]), forbidB = new Set([...onlyA]);
for (const [nm, fn] of Object.entries(house)) {
  for (const [who, uid, forbid, allowed] of [["titular A", OA, forbidA, onlyA], ["equipe de A", SA, forbidA, onlyA], ["titular B", OB, forbidB, onlyB]]) {
    const r = await as(uid, fn);
    ok(`${nm} — ${who}: sem erro`, !r.err, r.err);
    if (r.err) continue;
    const out = r.rows[0].r;
    ok(`${nm} — ${who}: nenhum identificador da outra casa`, leaks(out, forbid).length === 0, leaks(out, forbid).join());
    if (nm !== "indicadores") ok(`${nm} — ${who}: devolve dado da própria casa (não é vazio por engano)`, hits(out, allowed) >= 2, `${hits(out, allowed)}`);
  }
}
// ---- pessoa só de B é invisível para A (e a compartilhada não vaza eventos da outra casa)
const pB = await personTl(OA, CB1); ok("A não abre a linha do tempo de pessoa que só tem relação com B", !!pB.err, pB.err);
const pS = await personTl(OA, CS); ok("pessoa compartilhada: A abre", !pS.err, pS.err);
ok("pessoa compartilhada: a linha do tempo de A não traz nenhum registro de B", !pS.err && leaks(pS.rows[0].r, forbidA).length === 0, pS.err ?? leaks(pS.rows[0].r, forbidA).join());
const pS2 = await personTl(OB, CS); ok("pessoa compartilhada: a linha do tempo de B não traz nenhum registro de A", !pS2.err && leaks(pS2.rows[0].r, forbidB).length === 0);
const pEq = await personTl(SA, CS); ok("equipe de A também só vê A", !pEq.err && leaks(pEq.rows[0].r, forbidA).length === 0, pEq.err);
const nh = await as(NOB, house["central de pendências"]); ok("quem não é da casa não consulta", /not_house/.test(nh.err ?? ""));
// ---- admin: linha do tempo de A só tem A; B só tem B
const aA = await as(ADM, (c) => q(c, "select public.admin_house_timeline($1) r", [HA])), aB = await as(ADM, (c) => q(c, "select public.admin_house_timeline($1) r", [HB]));
ok("admin: linha do tempo de A sem nada de B", !aA.err && leaks(aA.rows[0].r, forbidA).length === 0 && hits(aA.rows[0].r, onlyA) >= 3, aA.err);
ok("admin: linha do tempo de B sem nada de A", !aB.err && leaks(aB.rows[0].r, forbidB).length === 0 && hits(aB.rows[0].r, onlyB) >= 3, aB.err);

// ---- reprodutibilidade: a mesma pergunta, no mesmo estado, dá a mesma resposta
const strip = (o) => JSON.stringify(o, (k, v) => (k === "generated_at" || k === "since" || k === "previous_since" ? undefined : v));
const diff = (a, b, path = "") => { if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return a === b ? [] : [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`]; return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], `${path}.${k}`)); };
for (const [nm, fn] of Object.entries(house)) { const r1 = (await as(OA, fn)).rows[0].r, r2 = (await as(OA, fn)).rows[0].r; ok(`${nm}: duas consultas seguidas dão o mesmo resultado`, strip(r1) === strip(r2), diff(r1, r2).join(" | ")); }
const ai1 = (await as(ADM, (c) => q(c, "select public.admin_indicators(30) r"))).rows[0].r, ai2 = (await as(ADM, (c) => q(c, "select public.admin_indicators(30) r"))).rows[0].r;
ok("indicadores da administração: duas consultas seguidas dão o mesmo resultado", strip(ai1) === strip(ai2), diff(ai1, ai2).join(" | "));
// recálculo independente (SQL direto nas tabelas originais) de números centrais
const direct = (await sv(`select coalesce(sum(p.gross_cents),0)::int vol, (select count(*)::int from service_orders where house_id=$1) ped from payments p join service_orders o on o.id=p.order_id where o.house_id=$1 and p.status='confirmado' and p.created_at >= now() - interval '30 days'`, [HA])).rows[0];
const hi = (await as(OA, house["indicadores"])).rows[0].r.metrics;
ok("indicadores da casa batem com o recálculo direto (volume e pedidos)", hi.volume_cents.current === direct.vol && hi.pedidos_criados.current === direct.ped, `${hi.volume_cents.current}/${direct.vol} ${hi.pedidos_criados.current}/${direct.ped}`);
// a casa B crescer não muda os números de A
const before = strip((await as(OA, house["indicadores"])).rows[0].r);
for (let i = 0; i < 20; i++) { const o = (await force(`insert into service_orders(house_id,client_id,title,price_cents,status) values ($1,$2,'x',9000,'concluido') returning id`, [HB, CB1])).rows[0].id; await force(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',9000,'confirmado','v2-2026-10',900,now(),'pix')`, [o]); }
ok("movimento na casa B não altera nenhum número de A", strip((await as(OA, house["indicadores"])).rows[0].r) === before);

// ---- leitura sem alteração (fora a auditoria da administração)
const snap = async () => (await sv(`select (select count(*) from messages)::int a, (select count(*) from service_orders)::int b, (select count(*) from member_dues)::int c, (select count(*) from platform_charges)::int d, (select count(*) from refund_requests)::int e, (select count(*) from payments)::int f, (select count(*) from reviews)::int g, (select count(*) from follows)::int h, (select count(*) from house_plan_history)::int i, (select count(*) from support_cases)::int j`)).rows[0];
const s1 = await snap();
for (const fn of Object.values(house)) await as(OA, fn);
await personTl(OA, CS); await as(ADM, (c) => q(c, "select public.admin_indicators(30) r")); await as(ADM, (c) => q(c, "select public.admin_pending_center() r"));
ok("consultar qualquer visão da fase não altera nenhum dado de negócio", JSON.stringify(s1) === JSON.stringify(await snap()));
// ---- ACL de todas as funções da fase
const FN = ["house_pending_center()", "house_people(text,text,integer,integer)", "house_person_timeline(uuid,integer)", "house_indicators(integer)", "admin_indicators(integer)", "admin_pending_center()", "admin_house_timeline(uuid,integer,timestamptz)"];
for (const f of FN) { const r = await sv(`select has_function_privilege('anon','public.${f}','execute') a, has_function_privilege('public','public.${f}','execute') p, has_function_privilege('authenticated','public.${f}','execute') u, (select prosecdef from pg_proc where oid = 'public.${f}'::regprocedure) d, (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = 'public.${f}'::regprocedure) cfg`); ok(`ACL e segurança de ${f}`, !r.rows[0].a && !r.rows[0].p && r.rows[0].u && r.rows[0].d === true && /search_path=public/.test(r.rows[0].cfg), JSON.stringify(r.rows[0])); }
// ---- só administração nas funções da administração
for (const [f, args] of [["admin_indicators", "30"], ["admin_pending_center", ""], ["admin_house_timeline", `'${HA}'`]]) { const r = await as(OA, (c) => q(c, `select public.${f}(${args}) r`)); ok(`${f}: titular de casa é recusada`, /not_admin|permission|42501/i.test(r.err ?? ""), r.err); }

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

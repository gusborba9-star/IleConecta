// Verificação LOCAL da migration 0129 (central de pendências da administração).
// Uso: node supabase/verify/verify_0129.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0129";
const { c: su, failed } = await freshDb(name, { with64: true, max: 128 });
ok("migrations 0001–0128 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const MIGFILE = process.env.MIG_FILE ?? "0129_central_de_pendencias_admin.sql";
const mig = readFileSync(new URL(`../migrations/${MIGFILE}`, import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0129 aplica e reaplica sem erro", e0 === null, e0 ?? "");
const tablesAfter = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
ok("não cria tabela nova (nenhuma cópia paralela)", tablesAfter === tablesBefore, `${tablesBefore} → ${tablesAfter}`);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 120)); return r; };
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
const uuid = (p, i) => `${p}0129000-0000-0000-0000-${String(i).padStart(12, "0")}`;

// ---- pessoas e casas
const ADM = uuid("a", 1), CLI = uuid("c", 1), O1 = uuid("b", 1), O2 = uuid("b", 2), H1 = uuid("d", 1), H2 = uuid("d", 2);
for (const [id, t, nm] of [[ADM, "cliente", "Admin"], [CLI, "cliente", "Cliente"], [O1, "casa", "Dona 1"], [O2, "casa", "Dona 2"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(" ", "")}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=$2", [id, t, nm]);
}
await su.query("insert into admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','gratis'),($3,$4,'Casa Dois','casa-dois','gratis')", [H1, O1, H2, O2]);

const central = (uid = ADM) => as(uid, (c) => q(c, "select public.admin_pending_center() r"));
const empty = await central();
ok("central vazia no começo", !empty.err && empty.rows[0].r.total === 0 && Array.isArray(empty.rows[0].r.items) && empty.rows[0].r.items.length === 0, empty.err);

// ---- acesso
const asCli = await central(CLI);
const asOwner = await central(O1);
const asAnon = await as(null, (c) => q(c, "select public.admin_pending_center() r"), "anon");
ok("cliente comum não consulta", !!asCli.err && /not_admin/.test(asCli.err), asCli.err);
ok("dona de casa não consulta", !!asOwner.err && /not_admin/.test(asOwner.err), asOwner.err);
ok("visitante sem login não consulta", !!asAnon.err, asAnon.err);
const hoursAnon = await as(null, (c) => q(c, "select public.pending_deadline_hours('denuncia_chat') h"), "anon");
const hoursAuth = await as(CLI, (c) => q(c, "select public.pending_deadline_hours('denuncia_chat') h"));
ok("prazos padrão não são chamados direto por visitante nem usuário", !!hoursAnon.err && !!hoursAuth.err, `${hoursAnon.err} | ${hoursAuth.err}`);
const keepNon = await as(O1, (c) => q(c, "select public.admin_review_report_keep($1)", [uuid("e", 1)]));
ok("encerrar denúncia de avaliação é só da administração", !!keepNon.err && /not_admin/.test(keepNon.err), keepNon.err);

// ---- dados de origem
const T = (h) => `now() - interval '${h} hours'`;
// suporte
await force(`insert into support_cases(kind,priority,status,opened_by,house_id,title,description,first_response_due,created_at) values
 ('pagamento','alta','aberto',$1,$2,'Cobrança em duplicidade','Descrição suficientemente longa do problema.', ${T(5)}, ${T(30)}),
 ('duvida','normal','em_analise',$1,null,'Dúvida sobre planos','Descrição suficientemente longa da dúvida.', now() + interval '2 days', now()),
 ('abuso','alta','aguardando_pessoa',$1,null,'Aguardando a pessoa','Descrição suficientemente longa do caso.', now() + interval '1 day', now()),
 ('abuso','alta','resolvido',$1,null,'Já resolvido','Descrição suficientemente longa do caso.', now() + interval '1 day', now())`, [CLI, H1]);
// moderação
const mf = (st, extra = "") => force(`insert into moderation_flags(house_id,target_table,target_id,reason,excerpt,status,created_at${extra ? "," + extra.split("|")[0] : ""}) values ($1,'services',gen_random_uuid(),'promessa','Cura garantida em 7 dias',$2, ${T(100)}${extra ? "," + extra.split("|")[1] : ""})`, [H1, st]);
await mf("pendente"); await mf("contestada", "contested_at|" + T(10)); await mf("orientada", "deadline_at|" + T(5)); await mf("advertida", "deadline_at|now() + interval '5 days'"); await mf("encerrada");
// denúncia de chat
const CV = (await su.query("insert into conversations default values returning id")).rows[0].id;
await force(`insert into chat_reports(reporter_id,reported_id,conversation_id,reason,status,created_at) values ($1,$2,$3,'ofensa','aberta', ${T(80)}), ($1,$2,$3,'ofensa','resolvida', ${T(80)})`, [CLI, O1, CV]);
// avaliações denunciadas
const rv = async (hidden, reviewedExpr) => {
  const o = (await su.query("insert into service_orders(house_id,client_id,title,price_cents,status) values ($1,$2,'Concluído',5000,'concluido') returning id", [H1, CLI])).rows[0].id;
  return (await force(`insert into reviews(house_id,author_id,rating,comment,reported_at,report_reason,hidden,report_reviewed_at,service_order_id) values ($1,$2,2,'Ruim',${T(200)},'Injusta',$3,${reviewedExpr}, $4) returning id`, [H1, CLI, hidden, o])).rows?.[0]?.id;
};
const RV_OPEN = await rv(false, "null"); const RV_HIDDEN = await rv(true, "null"); const RV_KEPT = await rv(false, "now()");
// exclusão de conta
await force(`insert into account_deletion_requests(user_id,status,requested_at,execute_after) values ($1,'pendente', ${T(24)}, now() + interval '6 days')`, [CLI]);
// reembolsos do cliente
const OR = (await su.query("insert into service_orders(house_id,client_id,title,price_cents,status) values ($1,$2,'Trabalho',10000,'reembolso_pendente') returning id", [H1, CLI]).catch((e) => ({ rows: [{ id: null }], e }))).rows[0].id;
const PAYID = (await force(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',10000,'confirmado','v2-2026-10',1000,now(),'pix') returning id`, [OR])).rows?.[0]?.id;
await force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status,created_at) values ($4,$1,$2,$3,'antes_do_inicio','Não recebi o atendimento',10000,'pendente', ${T(60)}),($4,$1,$2,$3,'antes_do_inicio','Não recebi o atendimento',5000,'recusado', ${T(60)})`, [OR, H1, CLI, PAYID]);
// pedido preso em reembolso pendente, sem pedido de reembolso aberto
await force(`insert into service_orders(house_id,client_id,title,price_cents,status,updated_at) values ($1,$2,'Pedido preso',9000,'reembolso_pendente', ${T(100)})`, [H2, CLI]);
// cobranças e reembolsos da plataforma
const ch = async (i, status, upd) => (await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,created_at,updated_at,paid_at,paid_amount_cents) values ($1,'plan','plan:essencial','Plano Essencial',8990,current_date - ($4::int * 31),current_date,$2,$3,${upd},${upd},${status === "paga" ? "now()" : "null"},${status === "paga" ? "8990" : "null"}) returning id`, [H2, status, `idem-0129-${i}`, i])).rows?.[0]?.id;
const C_STUCK = await ch(1, "em_processamento", T(100)); const C_RECENT = await ch(2, "em_processamento", T(1)); const C_PAID = await ch(3, "paga", T(5));
// reembolso de plano: no máximo um 'pendente/concluído' por casa, então usa casas separadas
const extraHouse = async (i) => { const o = uuid("f", i), h = uuid("9", i); await su.query("insert into auth.users(id,email) values ($1,$2)", [o, `extra${i}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Extra','Salvador') on conflict (id) do update set account_type='casa'", [o]); await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'gratis')", [h, o, `Extra ${i}`, `extra-${i}`]); return h; };
let cseq = 10;
const pr = async (tbl, st, ageH, house) => { const c = await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,paid_at,paid_amount_cents) values ($1,'plan','plan:essencial','Plano Essencial',8990,current_date - $2::int * 31,current_date,'paga',$3,now(),8990) returning id`, [house, ++cseq, `idem-0129-${cseq}`]); return force(`insert into ${tbl}(charge_id,house_id,amount_cents,status,created_at) values ($1,$2,8990,$3,${T(ageH)})`, [c.rows[0].id, house, st]); };
const [X1, X2, X3] = [await extraHouse(1), await extraHouse(2), await extraHouse(3)];
await pr("platform_plan_refunds", "falhou", 1, H2); await pr("platform_plan_refunds", "pendente", 5, X1); await pr("platform_plan_refunds", "pendente", 0.1, X2); await pr("platform_plan_refunds", "concluido", 50, X3);
await pr("platform_seat_refunds", "falhou", 1, H2);
await force(`insert into platform_credit_refunds(charge_id,house_id,pack_id,credits,amount_cents,status,created_at) values ($1,$2,gen_random_uuid(),80,1990,'falhou', ${T(1)})`, [C_PAID, H2]);
await force(`insert into promo_refunds(charge_id,house_id,promotion_id,reason,days_refunded,days_used,prev_days,amount_cents,status,created_at) values ($1,$2,gen_random_uuid(),'pedido',1,0,1,1990,'falhou', ${T(1)})`, [C_PAID, H2]);

ok("dados de teste semeados por completo (sem erro de preparo)", (await cnt("select count(*)::int n from platform_plan_refunds")) === 4 && (await cnt("select count(*)::int n from platform_seat_refunds")) === 1 && (await cnt("select count(*)::int n from platform_credit_refunds")) === 1 && (await cnt("select count(*)::int n from promo_refunds")) === 1 && (await cnt("select count(*)::int n from reviews")) === 3 && (await cnt("select count(*)::int n from moderation_flags")) === 5 && (await cnt("select count(*)::int n from refund_requests")) === 2);
const counts = async () => (await central()).rows[0].r;
let r = await counts();
const byKind = r.counts ?? {};
const expect = { suporte: 2, moderacao: 3, denuncia_chat: 1, avaliacao_denunciada: 1, exclusao_conta: 1, reembolso_cliente: 1, reembolso_plataforma: 5, cobranca_travada: 1, pedido_reembolso: 1 };
for (const [k, v] of Object.entries(expect)) ok(`conta de '${k}' = ${v}`, byKind[k] === v, `obtido ${byKind[k]}`);
ok("total = soma dos tipos", r.total === Object.values(expect).reduce((a, b) => a + b, 0), `${r.total}`);
const titles = r.items.map((i) => `${i.kind}:${i.detail}`);
ok("suporte: 'aguardando' e 'resolvido' ficam de fora", r.items.filter((i) => i.kind === "suporte").length === 2 && !r.items.some((i) => i.kind === "suporte" && /Aguardando|Já resolvido/.test(i.title)));
ok("moderação: encerrada e advertida dentro do prazo ficam de fora", r.items.filter((i) => i.kind === "moderacao").every((i) => ["pendente", "contestada", "orientada"].includes(i.detail)), titles.join(","));
ok("avaliação: escondida e já analisada ficam de fora", r.items.filter((i) => i.kind === "avaliacao_denunciada").length === 1 && r.items.find((i) => i.kind === "avaliacao_denunciada").ref_id === RV_OPEN);
ok("reembolso do cliente recusado fica de fora", r.items.filter((i) => i.kind === "reembolso_cliente").every((i) => i.detail === "pendente"));
ok("reembolso da plataforma: 'concluído' e 'pendente' recente ficam de fora", r.items.filter((i) => i.kind === "reembolso_plataforma").every((i) => i.detail === "falhou" || i.detail === "pendente") && r.items.filter((i) => i.kind === "reembolso_plataforma" && i.detail === "pendente").length === 1);
ok("cobrança: só a parada há muito tempo aparece", r.items.filter((i) => i.kind === "cobranca_travada").map((i) => i.ref_id).join() === C_STUCK);
ok("pedido preso só aparece se não houver pedido de reembolso aberto", r.items.filter((i) => i.kind === "pedido_reembolso").length === 1 && r.items.find((i) => i.kind === "pedido_reembolso").title === "Pedido preso");
ok("cada item aponta a origem (kind, ref_id, tab) e tem prioridade válida", r.items.every((i) => i.kind && i.ref_id && i.tab && ["urgente", "alta", "normal"].includes(i.priority)));
ok("valores em reais no formato brasileiro, independente do idioma do servidor", r.items.filter((i) => /^Reembolso/.test(i.title)).every((i) => /R\$ \d+,\d{2}$/.test(i.title)) && r.items.some((i) => i.title === "Reembolso de R$ 100,00"), r.items.filter((i) => /^Reembolso/.test(i.title)).map((i) => i.title).join(" | "));
ok("nome da casa vem junto", r.items.filter((i) => i.house_id === H1).every((i) => i.house_name === "Casa Um") && r.items.some((i) => i.house_name === "Casa Dois"));
ok("contagem de vencidos bate com os itens", r.overdue === r.items.filter((i) => i.overdue).length && r.overdue > 0);
// ordem: vencidos primeiro; dentro, urgente > alta > normal; dentro, prazo mais antigo
const rank = (p) => ({ urgente: 0, alta: 1, normal: 2 })[p];
let sorted = true;
for (let i = 1; i < r.items.length; i++) {
  const a = r.items[i - 1], b = r.items[i];
  if (a.overdue !== b.overdue) { if (!a.overdue) sorted = false; continue; }
  if (rank(a.priority) !== rank(b.priority)) { if (rank(a.priority) > rank(b.priority)) sorted = false; continue; }
  if (a.due_at && b.due_at && new Date(a.due_at) > new Date(b.due_at)) sorted = false;
}
ok("ordem: vencidos antes, depois prioridade, depois prazo", sorted && r.items[0].overdue === true);
ok("prazos: denúncia de chat = criação + 72 h", (() => { const i = r.items.find((x) => x.kind === "denuncia_chat"); return Math.abs((new Date(i.due_at) - new Date(i.since)) / 3600000 - 72) < 0.01; })());
ok("prazos: moderação contestada = contestação + 72 h", (() => { const i = r.items.find((x) => x.kind === "moderacao" && x.detail === "contestada"); return Math.abs((new Date(i.due_at) - Date.now()) / 3600000 + 10 - 72) < 0.1; })());

// ---- só leitura e sem efeito colateral
const snap = async () => (await sv(`select (select count(*) from support_cases)::int a, (select count(*) from moderation_flags)::int b, (select count(*) from reviews)::int c, (select count(*) from platform_charges)::int d, (select count(*) from admin_audit)::int e, (select count(*) from notifications)::int f`)).rows[0];
const s1 = await snap(); await central(); await central(); const s2 = await snap();
ok("consultar a central não altera nenhuma tabela, nem a auditoria", JSON.stringify(s1) === JSON.stringify(s2), JSON.stringify([s1, s2]));
const vol = await sv("select provolatile v, prosecdef d, proconfig c from pg_proc where proname='admin_pending_center'");
ok("função é 'stable', security definer, com search_path fixo", vol.rows[0].v === "s" && vol.rows[0].d === true && /search_path=public/.test(String(vol.rows[0].c)), JSON.stringify(vol.rows[0]));
const acl = await sv(`select has_function_privilege('anon','public.admin_pending_center()','execute') a, has_function_privilege('public','public.admin_pending_center()','execute') p, has_function_privilege('authenticated','public.pending_deadline_hours(text)','execute') h`);
ok("ACL: anon e public sem execute; prazos só service_role", !acl.rows[0].a && !acl.rows[0].p && !acl.rows[0].h, JSON.stringify(acl.rows[0]));

// ---- encerrar denúncia de avaliação
const keep = await as(ADM, (c) => q(c, "select public.admin_review_report_keep($1)", [RV_OPEN]));
ok("administração encerra a denúncia mantendo a avaliação", !keep.err, keep.err);
r = await counts();
ok("avaliação encerrada some da central", (r.counts.avaliacao_denunciada ?? 0) === 0);
ok("avaliação continua visível (não foi escondida)", (await cnt("select count(*)::int n from reviews where id=$1 and not hidden", [RV_OPEN])) === 1);
ok("a decisão fica na auditoria", (await cnt("select count(*)::int n from admin_audit where key='review_report_kept' and new_value->>'review'=$1", [RV_OPEN])) === 1);
const again = await as(O1, (c) => q(c, "select public.report_review($1,'Continua injusta, por favor revejam')", [RV_OPEN]));
ok("a casa não consegue reabrir a mesma contestação", !!again.err && /já analisou/.test(again.err), again.err);
const notRep = await as(ADM, (c) => q(c, "select public.admin_review_report_keep($1)", [uuid("e", 99)]));
ok("encerrar avaliação que não foi denunciada dá erro claro", !!notRep.err && /review_not_reported/.test(notRep.err), notRep.err);
const first = await as(O1, (c) => q(c, "select public.report_review($1,'Avaliação injusta e sem base')", [RV_HIDDEN]));
ok("denúncia nova de avaliação ainda não analisada continua permitida", !first.err, first.err);
const other = await as(O2, (c) => q(c, "select public.report_review($1,'Quero contestar essa avaliação')", [RV_HIDDEN]));
ok("outra casa não contesta avaliação alheia", !!other.err && /Só a casa avaliada/.test(other.err), other.err);

// ---- limite de 300 itens
await force(`insert into support_cases(kind,priority,status,opened_by,title,description,first_response_due,created_at) select 'duvida','normal','aberto',$1,'Dúvida '||g,'Descrição suficientemente longa da dúvida.', now() + interval '3 days', now() - interval '3000 hours' from generate_series(1,320) g`, [CLI]);
r = await counts();
ok("lista limitada a 300 itens, mas o total é real", r.items.length === 300 && r.total > 300, `${r.items.length}/${r.total}`);
ok("com o corte, os vencidos continuam no topo e nenhum some", r.items[0].overdue === true && r.items.filter((i) => i.overdue).length === r.overdue);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

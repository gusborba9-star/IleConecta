// Verificação LOCAL da migration 0153 (tarifa do Stripe das mensalidades no livro-caixa). Uso: node supabase/verify/verify_0153.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0153";
const { c: su, failed } = await freshDb(name, { with64: true, max: 152 });
ok("migrations 0001–0152 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`insert into fee_rule_versions(version, rates, reason) values ('v2-2026-10','{"ritual":1500,"servico":400,"mensalidade":400}','Regra vigente em produção') on conflict do nothing`);
const U = (n) => `a0153000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2, 3]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=$2", [U(n), n === 1 ? "casa" : "cliente", `Pessoa ${n}`]); }
const H = "b0153000-0000-0000-0000-000000000001";
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa','casa','maximo')", [H, U(1)]);
const sv = async (fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid','',false), set_config('test.role','service_role',false)`); await c.query("set role service_role"); return await fn(c); } finally { await c.end(); } };
const as = async (uid, role, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };

// fixtures: mensalidade, serviço, ritual (os três caminhos de pagamento), todos já confirmados
const M = (await su.query("insert into house_members(house_id,user_id,display_name,monthly_cents,start_month) values ($1,$2,'Membro Teste',10000,date_trunc('month',now())::date) returning id", [H, U(2)])).rows[0].id;
await su.query("select member_ensure_due($1, date_trunc('month',now())::date)", [M]);
const D = (await su.query("select id from member_dues where member_id=$1", [M])).rows[0].id;
const mkPay = async (cols, vals, ref) => (await su.query(`insert into payments(${cols}, provider, provider_ref, stripe_account_id, gross_cents, status) values (${vals}, 'stripe', $1, 'acct_x', 10000, 'pendente') returning id`, [ref])).rows[0].id;
const P_M = await mkPay("member_due_id", `'${D}'`, "cs_m");
const SV = (await su.query("insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Trabalho X','Descrição longa o suficiente para o serviço ser válido e aceito.',10000,true,'transmissao',true,60) returning id", [H])).rows[0].id;
const O = (await su.query("insert into service_orders(service_id,house_id,client_id,title,price_cents,status) values ($1,$2,$3,'Trabalho X',10000,'aguardando_pagamento') returning id", [SV, H, U(3)])).rows[0].id;
const P_O = await mkPay("order_id", `'${O}'`, "cs_o");
const EV = (await su.query("insert into events(house_id,title,price_cents,seats_total,starts_at,description,duration_min) values ($1,'Ritual',10000,10, now()+interval '5 days','Descrição longa o suficiente para o ritual ser válido e aceito.',120) returning id", [H])).rows[0].id;
const R = (await su.query("insert into reservations(event_id,user_id,status,expires_at) values ($1,$2,'aguardando_pagamento', now()+interval '1 day') returning id", [EV, U(3)])).rows[0].id;
const P_R = await mkPay("reservation_id", `'${R}'`, "cs_r");
for (const [p, ref] of [[P_M, "cs_m"], [P_O, "cs_o"], [P_R, "cs_r"]]) await sv((c) => c.query("select confirm_payment_for($1,'stripe',$2,'acct_x')", [p, ref]));
ok("os três pagamentos confirmados", (await su.query("select count(*)::int n from payments where status='confirmado'")).rows[0].n === 3);

const fee = (p, ref = null, acc = "acct_x", val = 120, role = "service_role") => as(null, role, (c) => c.query("select record_processor_fee_for($1,'stripe',$2,$3,$4,'card') r", [p, ref, acc, val])).then((r) => r.rows[0].r, (x) => "ERRO:" + x.message);
const taxa = async (p) => (await su.query("select count(*)::int n, sum(amount_cents)::int s, min(house_id::text) h from ledger_entries where payment_id=$1 and entry_type='taxa_provedor'", [p])).rows[0];

// ANTES da correção: o defeito existe (mensalidade grava a tarifa mas não lança)
const antes = await fee(P_M, "cs_m");
ok("antes: mensalidade registra a tarifa no pagamento", antes === "registrada");
ok("antes: DEFEITO — sem lançamento taxa_provedor para a mensalidade", (await taxa(P_M)).n === 0);
ok("antes: serviço e ritual lançam normalmente", (await fee(P_O, "cs_o")) === "registrada" && (await fee(P_R, "cs_r")) === "registrada" && (await taxa(P_O)).n === 1 && (await taxa(P_R)).n === 1);

const aclAntes = (await su.query("select proacl::text a from pg_proc where proname='record_processor_fee_for'")).rows[0].a;
// aplica a correção (e reaplica)
const mig = readFileSync(new URL("../migrations/0153_tarifa_do_stripe_nas_mensalidades.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0153 aplica e reaplica sem erro", e === null, e ?? "");
const t1 = await taxa(P_M);
ok("a retroalimentação lança a tarifa da mensalidade já gravada (1 lançamento, 120, casa certa)", t1.n === 1 && t1.s === 120 && t1.h === H, JSON.stringify(t1));
ok("reaplicar não duplica", (await su.query("select count(*)::int n from ledger_entries where payment_id=$1 and entry_type='taxa_provedor'", [P_M])).rows[0].n === 1);

// pagamento de mensalidade novo, depois da correção
const D2 = (await su.query("insert into member_dues(member_id,house_id,month,amount_cents,due_date) values ($1,$2,(date_trunc('month',now()) + interval '1 month')::date,10000,(date_trunc('month',now()) + interval '1 month')::date) returning id", [M, H])).rows[0].id;
const P_M2 = await mkPay("member_due_id", `'${D2}'`, "cs_m2");
await sv((c) => c.query("select confirm_payment_for($1,'stripe','cs_m2','acct_x')", [P_M2]));
ok("depois: mensalidade nova lança a tarifa na hora em que ela chega", (await fee(P_M2, "cs_m2", "acct_x", 250)) === "registrada" && (await taxa(P_M2)).s === 250 && (await taxa(P_M2)).h === H);
ok("segunda chegada da mesma tarifa não duplica", (await fee(P_M2, "cs_m2", "acct_x", 250)) === "ja_registrada" && (await taxa(P_M2)).n === 1);
// ataques
const P_M3 = await (async () => { const D3 = (await su.query("insert into member_dues(member_id,house_id,month,amount_cents,due_date) values ($1,$2,(date_trunc('month',now()) + interval '2 month')::date,10000,(date_trunc('month',now()) + interval '2 month')::date) returning id", [M, H])).rows[0].id; const p = await mkPay("member_due_id", `'${D3}'`, "cs_m3"); await sv((c) => c.query("select confirm_payment_for($1,'stripe','cs_m3','acct_x')", [p])); return p; })();
ok("referência errada: recusa (divergente) e não lança", (await fee(P_M3, "cs_FALSA")) === "divergente" && (await taxa(P_M3)).n === 0);
ok("conta Stripe errada: recusa (divergente) e não lança", (await fee(P_M3, "cs_m3", "acct_OUTRA")) === "divergente" && (await taxa(P_M3)).n === 0);
ok("valor negativo: recusa", /Tarifa inválida/.test(await fee(P_M3, "cs_m3", "acct_x", -5)) && (await taxa(P_M3)).n === 0);
ok("quem não é o servidor não registra tarifa", /ERRO:.*(permission denied|Não autorizado)/.test(await fee(P_M3, "cs_m3", "acct_x", 100, "authenticated")), await fee(P_M3, "cs_m3", "acct_x", 100, "authenticated"));
ok("visitante sem conta também não", /ERRO:.*(permission denied|Não autorizado)/.test(await fee(P_M3, "cs_m3", "acct_x", 100, "anon")));
ok("nenhuma tarifa lançada em duplicidade no total", (await su.query("select count(*)::int n from (select payment_id from ledger_entries where entry_type='taxa_provedor' group by payment_id having count(*)>1) x")).rows[0].n === 0);
// o estorno de mensalidade continua somando só bruto, plataforma e casa (a tarifa lançada não atrapalha)
const rec = await su.query("select * from payment_recorded_amounts($1)", [P_M]).then((r) => r.rows[0], (x) => ({ err: x.message }));
ok("estorno da mensalidade continua calculando (tarifa lançada não interfere)", rec.err === undefined && Number(rec.gross) === 10000 && Number(rec.fee) === 400 && Number(rec.net) === 9600, JSON.stringify(rec));
// permissões da função como antes
const acl = (await su.query("select proacl::text a from pg_proc where proname='record_processor_fee_for'")).rows[0].a;
ok("permissões da função iguais às de antes da correção", acl === aclAntes, aclAntes + " → " + acl);
await su.end();
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);

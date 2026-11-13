// Verificação LOCAL da migration 0084 (taxas versionadas): aplica 0001–0084 num PostgreSQL 16 e ataca.
// Uso: node supabase/verify/verify_0084.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0084", { with64: true, max: 84 });
ok("migrations 0001–0084 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const as = async (role, uid, fn) => { const c = await connect("vf0084"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const ADM = "a1000000-0000-0000-0000-0000000000a1", USR = "c0000000-0000-0000-0000-00000000000c";
await su.query("insert into auth.users(id,email) values ($1,'adm@x'),($2,'usr@x')", [ADM, USR]);
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
// permissões do harness: reaplica os revokes reais da migration (o grant geral acima só serve para o ambiente de teste)
await su.query(readFileSync(new URL("../migrations/0084_taxas_versionadas.sql", import.meta.url), "utf8").split("-- ============ 5) permissões ============")[1]);

// --- semente e cálculo ---
let r = await q(su, "select version, rates from public.current_fee_rules()");
ok("regra vigente inicial é v2-2026-10 (15% / 4% / 4%)", r.rows[0]?.version === "v2-2026-10" && r.rows[0].rates.ritual === 1500 && r.rows[0].rates.servico === 400 && r.rows[0].rates.mensalidade === 400, JSON.stringify(r.rows));
const fee = async (g, k) => (await q(su, "select public.fee_cents($1::bigint,$2) f", [g, k])).rows[0]?.f;
ok("ritual 10000 → 1500", String(await fee(10000, "ritual")) === "1500");
ok("serviço 10000 → 400 e servico_pix igual", String(await fee(10000, "servico")) === "400" && String(await fee(10000, "servico_pix")) === "400");
ok("arredondamento meio-para-cima (ritual 3 centavos → 0; 4 → 1; serviço 125 → 5)", String(await fee(3, "ritual")) === "0" && String(await fee(4, "ritual")) === "1" && String(await fee(125, "servico")) === "5");
r = await q(su, "select public.fee_cents(100, 'xyz')"); ok("tipo inválido é recusado", !!r.err, r.err);
r = await q(su, "select public.fee_cents(-1, 'ritual')"); ok("valor negativo é recusado", !!r.err, r.err);

// --- imutabilidade e forma ---
r = await q(su, "update public.fee_rule_versions set reason = 'alterado de novo aqui'"); ok("versão não pode ser alterada (nem por service_role)", !!r.err, r.err);
r = await q(su, "delete from public.fee_rule_versions"); ok("versão não pode ser apagada", !!r.err, r.err);
for (const [n, rates] of [["taxa acima de 30%", { ritual: 3001, servico: 400, mensalidade: 400 }], ["chave faltando", { ritual: 1500, servico: 400 }], ["chave extra", { ritual: 1500, servico: 400, mensalidade: 400, x: 1 }], ["texto em vez de número", { ritual: "1500", servico: 400, mensalidade: 400 }], ["negativa", { ritual: -1, servico: 400, mensalidade: 400 }], ["decimal", { ritual: 15.5, servico: 400, mensalidade: 400 }]]) {
  r = await q(su, "insert into public.fee_rule_versions(version, rates, reason) values ('v9-x', $1, 'motivo de teste ok')", [JSON.stringify(rates)]);
  ok(`inserção direta inválida recusada: ${n}`, !!r.err, r.err);
}

// --- permissões ---
const hasFn = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
ok("anon não executa admin_set_fee_rules nem fee_cents", !(await hasFn("anon", "public.admin_set_fee_rules(jsonb,text)")) && !(await hasFn("anon", "public.fee_cents(bigint,text)")));
ok("authenticated não executa fee_cents nem current_fee_rules", !(await hasFn("authenticated", "public.fee_cents(bigint,text)")) && !(await hasFn("authenticated", "public.current_fee_rules()")));
r = await as("authenticated", USR, (c) => q(c, "select * from public.admin_set_fee_rules('{\"ritual\":1000,\"servico\":300,\"mensalidade\":300}', 'tentativa de usuário comum')")); ok("usuário comum não altera taxas", !!r.err && /not_admin/.test(r.err), r.err);
r = await as("authenticated", USR, (c) => q(c, "select count(*) n from public.fee_rule_versions")); ok("usuário comum não lê a tabela de taxas (RLS)", r.rows[0]?.n === "0", JSON.stringify(r));
r = await as("authenticated", ADM, (c) => q(c, "select count(*) n from public.fee_rule_versions")); ok("administrador lê a tabela", r.rows[0]?.n === "1", JSON.stringify(r));
r = await as("authenticated", ADM, (c) => q(c, "insert into public.fee_rule_versions(version, rates, reason) values ('v9-x', '{\"ritual\":1,\"servico\":1,\"mensalidade\":1}', 'inserção direta pelo admin')")); ok("nem o administrador grava direto na tabela", !!r.err, r.err);

// --- alteração pelo administrador ---
const set = (rates, reason) => as("authenticated", ADM, (c) => q(c, "select public.admin_set_fee_rules($1::jsonb,$2) v", [JSON.stringify(rates), reason]));
r = await set({ ritual: 1500, servico: 400, mensalidade: 400 }, "sem nenhuma mudança real aqui"); ok("sem mudança é recusado", !!r.err && /Nenhuma taxa mudou/.test(r.err), r.err);
r = await set({ ritual: 1200, servico: 400, mensalidade: 400 }, "curto"); ok("motivo curto é recusado", !!r.err && /motivo/i.test(r.err), r.err);
r = await set({ ritual: 3001, servico: 400, mensalidade: 400 }, "taxa acima do limite permitido"); ok("taxa acima de 30% é recusada", !!r.err, r.err);
r = await set({ ritual: "12", servico: 400, mensalidade: 400 }, "taxa como texto não vale aqui"); ok("taxa em texto é recusada", !!r.err, r.err);
r = await set({ ritual: 1500, servico: 400 }, "faltando a chave da mensalidade"); ok("chave faltando é recusada com mensagem clara", !!r.err && /pontos-base/.test(r.err), r.err);

// pagamentos: tira só as chaves estrangeiras para o teste (os gatilhos continuam valendo)
for (const col of ["reservation_id", "order_id", "member_due_id"]) {
  const k = (await su.query("select conname from pg_constraint where conrelid='public.payments'::regclass and contype='f' and conkey @> array[(select attnum from pg_attribute where attrelid='public.payments'::regclass and attname=$1)]", [col])).rows;
  for (const { conname } of k) await su.query(`alter table public.payments drop constraint ${conname}`);
}
const pay = async (col, gross, bogusFee = 1, bogusVer = "fin-v1") => (await q(su, `insert into public.payments (${col}, provider, gross_cents, fee_cents, fee_rule_version, status) values (gen_random_uuid(), 'stripe', $1, $2, $3, 'pendente') returning id, fee_cents::text f, fee_rule_version v`, [gross, bogusFee, bogusVer]));
let p1 = await pay("reservation_id", 20000);
ok("ritual novo: gatilho grava 15% e a versão vigente (ignora o que o chamador mandou)", p1.rows?.[0]?.f === "3000" && p1.rows[0].v === "v2-2026-10", JSON.stringify(p1));
let p2 = await pay("order_id", 20000, 99999999);
ok("serviço novo: 4% mesmo se o chamador mandar outro valor", p2.rows?.[0]?.f === "800", JSON.stringify(p2));
let p3 = await pay("member_due_id", 9900);
ok("mensalidade nova: 4%", p3.rows?.[0]?.f === "396", JSON.stringify(p3));

r = await set({ ritual: 1000, servico: 500, mensalidade: 300 }, "teste de nova regra pelo administrador");
ok("admin cria nova versão (v3-AAAA-MM-DD)", /^v3-\d{4}-\d{2}-\d{2}$/.test(r.rows?.[0]?.v ?? ""), JSON.stringify(r));
const v3 = r.rows?.[0]?.v;
r = await q(su, "select version, rates from public.current_fee_rules()"); ok("regra vigente passou para a nova", r.rows[0]?.version === v3 && r.rows[0].rates.ritual === 1000);
let p4 = await pay("reservation_id", 20000);
ok("ritual depois da mudança: 10% e nova versão", p4.rows?.[0]?.f === "2000" && p4.rows[0].v === v3, JSON.stringify(p4));
let p5 = await pay("order_id", 20000); ok("serviço depois da mudança: 5%", p5.rows?.[0]?.f === "1000");
ok("fee_cents() acompanha a regra nova", String(await fee(10000, "mensalidade")) === "300");
r = await q(su, "select id, fee_cents::text f, fee_rule_version v from public.payments where id = any($1)", [[p1.rows[0].id, p2.rows[0].id, p3.rows[0].id]]);
ok("pagamentos antigos NÃO foram recalculados", r.rows.length === 3 && r.rows.find((x) => x.id === p1.rows[0].id).f === "3000" && r.rows.find((x) => x.id === p1.rows[0].id).v === "v2-2026-10");
r = await q(su, "select key, old_value, new_value from public.admin_audit where key='fee_rules'");
ok("histórico do admin guarda antes, depois e motivo", r.rows.length === 1 && r.rows[0].old_value.version === "v2-2026-10" && r.rows[0].new_value.version === v3 && /teste de nova regra/.test(r.rows[0].new_value.reason), JSON.stringify(r.rows));
r = await set({ ritual: 1000, servico: 500, mensalidade: 300 }, "repetir a mesma regra de novo"); ok("repetir a mesma regra é recusado", !!r.err, r.err);
// duas alterações no mesmo dia geram versões distintas
r = await set({ ritual: 1100, servico: 500, mensalidade: 300 }, "segunda alteração no mesmo dia");
ok("segunda alteração no mesmo dia gera versão própria", /^v4-/.test(r.rows?.[0]?.v ?? "") && r.rows[0].v !== v3, JSON.stringify(r));
// pagamento sem origem continua impossível (regra já existente do banco)
r = await q(su, "insert into public.payments (provider, gross_cents, fee_cents, status) values ('stripe', 1000, 7, 'pendente')"); ok("pagamento sem origem segue recusado", !!r.err, r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);

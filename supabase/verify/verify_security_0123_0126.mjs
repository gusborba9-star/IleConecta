// Bateria ADVERSARIAL LOCAL das etapas 0123–0126 (Pix, aviso de 30 dias, vaga extra, CPF/CNPJ).
// Uso: node supabase/verify/verify_security_0123_0126.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"]];
const name = "vsec0126";
const { c: su, failed } = await freshDb(name, { with64: true, max: 126 });
ok("migrations 0001–0126 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) { try { await su.query(part(f, m)); } catch { /* assinatura antiga */ } }
await su.query("insert into vault.secrets(name, secret) values ('tax_id_key', 'chave-de-teste-sec')");
// reaplica as migrations novas depois dos grants gerais do harness (como no banco real, as revokes delas valem)
// no banco real a rotina diária só é executável pelo servidor (conferido na produção); no harness a revoke da 0088 pode cair no catch acima
await su.query("revoke all on function public.platform_billing_tick(timestamptz) from public, anon, authenticated");
for (const f of ["0124_aviso_30_dias_bloqueio_total.sql", "0125_vaga_extra_de_equipe.sql", "0126_cpf_cnpj_da_casa.sql", "0127_endurecimento_etapas_0123_0126.sql"]) {
  try { await su.query(readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8")); } catch (e) { ok("reaplica " + f, false, e.message); }
}
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const asRole = async (role, uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const as = (uid, fn) => asRole("authenticated", uid, fn);
const anon = (fn) => asRole("anon", null, fn);
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); return r; };
const today = (await sv("select (now() at time zone 'America/Sao_Paulo')::date d")).rows[0].d;
const billingDayFor = (offset) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + offset); return Math.min(d.getUTCDate(), 28); };
let seq = 0;
async function mk(tag, plan, { billing = null, startedAgo = 40 } = {}) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0900000-0000-0000-0000-00000000${hex}`, H = `d0900000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-$3::int,true)", [H, billing, startedAgo]);
  return { O, H };
}
async function mkUser(tag) {
  const i = ++seq; const U = `b0900000-0000-0000-0000-00000000${String(i).padStart(4, "0")}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [U, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Pessoa','Salvador') on conflict (id) do update set account_type='cliente'", [U]);
  return U;
}
// CPF/CNPJ válidos
const cpfOf = (b9) => { const d = b9.split("").map(Number); const dv = (a) => { const s = a.reduce((t, x, i) => t + x * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(d); const d2 = dv([...d, d1]); return [...d, d1, d2].join(""); };
const cnpjOf = (b12) => { const d = b12.split("").map((ch) => ch.charCodeAt(0) - 48); const dv = (a) => { const w = a.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = a.reduce((t, x, i) => t + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; }; const d1 = dv(d); const d2 = dv([...d, d1]); return b12 + d1 + d2; };
let n = 0;
const attach = async (id) => { const ref = `cs_sec_${++n}`; await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]); return ref; };
const confirmOn = async (ref, amount) => { const c = await connect(name); try { return await q(c, "select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amount]); } finally { await c.end(); } };
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;

// ================= 1) PERMISSÕES =================
const A = await mk("a", "maximo", { billing: billingDayFor(-10) });
const B = await mk("b", "maximo", { billing: billingDayFor(-10) });
const STAFF = await mkUser("staff");
const NOH = await mkUser("semcasa");
const adminU = await mkUser("adm");
await sv("insert into admins(user_id) values ($1) on conflict do nothing", [adminU]).then((r) => r.err && console.log("(admins insert)", r.err));
const FN_BLOCKED = [
  ["platform_seat_issue", "select public.platform_seat_issue($1)", [A.H]],
  ["platform_seat_quote", "select public.platform_seat_quote($1, current_date)", [A.H]],
  ["platform_seat_release_apply_due", "select public.platform_seat_release_apply_due()", []],
  ["tax_id_store", "select public.tax_id_store($1,$2,$3,true)", [A.H, cpfOf("123456789"), A.O]],
  ["tax_id_key", "select public.tax_id_key()", []],
  ["platform_require_tax_id", "select public.platform_require_tax_id($1)", [A.H]],
  ["tax_id_kind", "select public.tax_id_kind($1)", [cpfOf("123456789")]],
  ["platform_subscribe_issue", "select public.platform_subscribe_issue($1,'maximo')", [A.H]],
  ["platform_upgrade_issue", "select public.platform_upgrade_issue($1,'maximo')", [A.H]],
  ["platform_reactivation_issue", "select public.platform_reactivation_issue($1)", [A.H]],
  ["platform_billing_tick", "select public.platform_billing_tick()", []],
  ["platform_charge_confirm", "select public.platform_charge_confirm('stripe','x',1::bigint,59)", []],
  ["platform_charge_issue", "select public.platform_charge_issue($1,'plan','plan:maximo',100::bigint,current_date,current_date,'x','k-evil')", [A.H]],
];
for (const [label, sql, p] of FN_BLOCKED) {
  const ra = await anon((c) => q(c, sql, p)); const rb = await as(A.O, (c) => q(c, sql, p));
  ok(`PERM: ${label} bloqueada para anon`, !!ra.err, ra.err ?? "EXECUTOU"); ok(`PERM: ${label} bloqueada para usuário logado`, !!rb.err, rb.err ?? "EXECUTOU");
}
for (const t of ["house_tax_ids", "tax_id_access_log"]) {
  ok(`PERM: leitura direta de ${t} negada (logado)`, !!(await as(A.O, (c) => q(c, `select * from ${t}`))).err); ok(`PERM: leitura direta de ${t} negada (anon)`, !!(await anon((c) => q(c, `select * from ${t}`))).err);
  ok(`PERM: escrita direta em ${t} negada`, !!(await as(A.O, (c) => q(c, `insert into ${t}(house_id) values ($1)`, [A.H]))).err);
}
// tabelas que o app só lê: nenhuma escrita direta pelo cliente tem efeito (RLS sem política de escrita)
for (const [t, ins, upd, eff] of [
  ["house_extra_seats", "insert into house_extra_seats(house_id, seats) values ($1, 20)", "update house_extra_seats set seats = 20", "select count(*)::int n from house_extra_seats where seats = 20"],
  ["platform_settings", "insert into platform_settings(key,value) values ('features','{}')", "update platform_settings set value = '{}'", "select count(*)::int n from platform_settings where value = '{}'::jsonb"],
  ["platform_charges", "insert into platform_charges(house_id,kind,plan,amount_cents,idempotency_key) values ($1,'plan','base',1,'evil')", "update platform_charges set status='paga'", "select count(*)::int n from platform_charges where idempotency_key='evil' or status='paga'"],
]) {
  await as(A.O, (c) => q(c, ins, ins.includes("$1") ? [A.H] : [])); await as(A.O, (c) => q(c, upd)); await as(A.O, (c) => q(c, `delete from ${t}`));
  await anon((c) => q(c, ins, ins.includes("$1") ? [A.H] : [])); await anon((c) => q(c, upd)); await anon((c) => q(c, `delete from ${t}`));
  ok(`PERM: ${t} — insert/update/delete do cliente (logado e anon) não têm efeito`, await cnt(eff) === 0);
}
ok("PERM: platform_settings segue com as linhas (delete do cliente não apagou)", await cnt("select count(*)::int n from platform_settings") >= 3);
// admin_*: só admin
for (const [label, sql, p] of [["admin_house_tax_id", "select public.admin_house_tax_id($1,'motivo bem longo aqui')", [A.H]], ["admin_house_tax_id_set", "select public.admin_house_tax_id_set($1,$2,'motivo bem longo aqui')", [A.H, cpfOf("111444777")]], ["admin_set_house_seats", "select public.admin_set_house_seats($1, 5)", [A.H]]]) {
  const r = await as(B.O, (c) => q(c, sql, p)); const ra = await anon((c) => q(c, sql, p));
  ok(`ADMIN: ${label} nega a dono de outra casa`, !!r.err && /not_admin|permission/i.test(r.err), r.err); ok(`ADMIN: ${label} nega anon`, !!ra.err);
}
ok("ADMIN: nada foi gravado pelas tentativas", await cnt("select count(*)::int n from house_tax_ids") === 0 && await cnt("select count(*)::int n from house_extra_seats") === 0);
for (const f of ["my_tax_id_status()", "my_tax_id_set('x')", "my_seat_status()", "my_seat_release_schedule(0)", "my_seat_release_undo()"]) {
  const r = await anon((c) => q(c, `select public.${f}`)); ok(`ANON: ${f} não funciona sem login`, !!r.err, r.err ?? "EXECUTOU");
}

// ================= 2) ENTRADAS HOSTIS (CPF/CNPJ) =================
const good = cpfOf("123456789"), goodCnpj = cnpjOf("112223330001");
const HOSTILE = [
  ["injeção SQL", "123'; drop table house_tax_ids; --"], ["aspas e ponto-e-vírgula", `${good}'); delete from houses; --`], ["vazio", ""], ["só espaços", "   "],
  ["dígitos repetidos", "11111111111"], ["CPF com dígito errado", good.slice(0, 10) + ((Number(good[10]) + 1) % 10)], ["curto", "123"], ["longo (5000 dígitos)", "1".repeat(5000)],
  ["letras acentuadas", "ÇÁ" + good.slice(2)], ["CPF com letra", "A" + good.slice(1)], ["tabulação", "\t" + good], ["quebra de linha", good + "\n"], ["CNPJ alfanumérico com dígito errado", cnpjOf("AB12CD34EF56").slice(0, 13) + ((Number(cnpjOf("AB12CD34EF56")[13]) + 1) % 10)], ["CNPJ com letra nos dígitos verificadores", cnpjOf("AB12CD34EF56").slice(0, 13) + "Z"],
  ["dígitos árabes", "١٢٣٤٥٦٧٨٩٠١"], ["CNPJ zerado", "00000000000000"], ["controle", "123\u0007456\u0007789"], ["emoji", "🏠🏠🏠"],
];
const H0 = await mk("h0", "maximo", { billing: billingDayFor(-10) });
for (const [label, v] of HOSTILE) {
  const r = await as(H0.O, (c) => q(c, "select public.my_tax_id_set($1) r", [v]));
  ok(`HOSTIL: documento "${label}" é recusado`, !!r.err && !/syntax|relation|does not exist/i.test(r.err), r.err ?? "ACEITOU");
}
ok("HOSTIL: nada gravado após entradas inválidas; tabelas intactas", await cnt("select count(*)::int n from house_tax_ids where house_id=$1", [H0.H]) === 0 && await cnt("select count(*)::int n from houses") >= 3);
const fm = await as(H0.O, (c) => q(c, "select public.my_tax_id_set($1) r", [`  ${good.slice(0, 3)}.${good.slice(3, 6)}.${good.slice(6, 9)}-${good.slice(9)}  `]));
ok("HOSTIL: CPF válido com máscara/espaços é aceito e normalizado", !fm.err && fm.rows[0].r.kind === "cpf", fm.err);
const st0 = (await as(H0.O, (c) => q(c, "select public.my_tax_id_status() s"))).rows[0].s;
ok("VAZAMENTO: status só mostra final mascarado", st0.masked === `***.***.***-${good.slice(9)}` && !JSON.stringify(st0).includes(good.slice(0, 9)), JSON.stringify(st0));
const digits = good, fmtd = `${good.slice(0, 3)}.${good.slice(3, 6)}.${good.slice(6, 9)}-${good.slice(9)}`;
const tabs = (await sv("select table_name, column_name from information_schema.columns where table_schema='public' and data_type in ('text','character varying','jsonb','json')")).rows;
let leaks = [];
for (const { table_name: t, column_name: col } of tabs) {
  if (t === "house_tax_ids" && col === "doc_enc") continue;
  const r = await sv(`select count(*)::int n from public."${t}" where "${col}"::text like $1 or "${col}"::text like $2`, [`%${digits}%`, `%${fmtd}%`]);
  if (!r.err && r.rows[0].n > 0) leaks.push(`${t}.${col}`);
}
ok("VAZAMENTO: o documento completo não aparece em texto puro em nenhuma tabela", leaks.length === 0, leaks.join(", "));
ok("VAZAMENTO: doc_enc é cifrado (não contém o número)", (await sv("select (encode(doc_enc,'escape') like '%'||$1||'%') l from house_tax_ids where house_id=$2", [digits, H0.H])).rows[0].l === false);
const again = await as(H0.O, (c) => q(c, "select public.my_tax_id_set($1) r", [cpfOf("987654321")]));
ok("DOCUMENTO: dono não troca o documento sozinho", !!again.err && /já foi informado/.test(again.err), again.err);
const ns = await as(NOH, (c) => q(c, "select public.my_tax_id_set($1) r", [good]));
ok("DOCUMENTO: quem não tem casa não informa", !!ns.err && /Só a casa/.test(ns.err), ns.err);
const si = await sv("insert into house_staff(house_id, user_id, name, active) values ($1,$2,'Atendente',true)", [B.H, STAFF]); if (si.err) console.log("(staff insert)", si.err);
const stf = await as(STAFF, (c) => q(c, "select public.my_tax_id_set($1) r", [goodCnpj]));
ok("DOCUMENTO: membro da equipe não informa documento da casa", !!stf.err, stf.err ?? "EXECUTOU");
const sts = (await as(STAFF, (c) => q(c, "select public.my_tax_id_status() s"))).rows[0]?.s;
ok("DOCUMENTO: status do membro da equipe não expõe documento da casa", !sts || sts.has_house === false || !sts.masked, JSON.stringify(sts));
ok("DOCUMENTO: casa B continua sem documento", await cnt("select count(*)::int n from house_tax_ids where house_id=$1", [B.H]) === 0);
const adm = (fn) => as(adminU, fn);
let r = await adm((c) => q(c, "select public.admin_house_tax_id($1,'curto') r", [H0.H]));
ok("ADMIN: leitura sem motivo mínimo é negada", !!r.err, r.err);
r = await adm((c) => q(c, "select public.admin_house_tax_id($1,'conferir nota fiscal do cliente') r", [H0.H]));
ok("ADMIN: leitura com motivo devolve o documento", !r.err && r.rows[0].r.set === true && r.rows[0].r.doc.replace(/\D/g, "") === digits, r.err ?? JSON.stringify(r.rows[0].r));
ok("ADMIN: leitura deixou registro (quem, casa, motivo)", await cnt("select count(*)::int n from tax_id_access_log where house_id=$1 and admin_id=$2 and action='ver'", [H0.H, adminU]) === 1);
r = await adm((c) => q(c, "select public.admin_house_tax_id_set($1,$2,'correção pedida pelo cliente') r", [H0.H, goodCnpj]));
ok("ADMIN: corrige o documento com motivo e registra", !r.err && await cnt("select count(*)::int n from tax_id_access_log where house_id=$1 and action='corrigir'", [H0.H]) === 1, r.err);
r = await adm((c) => q(c, "select public.admin_house_tax_id_set($1,'123','correção pedida pelo cliente') r", [H0.H]));
ok("ADMIN: correção com documento inválido é negada e não registra", !!r.err && await cnt("select count(*)::int n from tax_id_access_log where action='corrigir'") === 1, r.err);
r = await adm((c) => q(c, "select public.admin_house_tax_id($1,'conferir nota fiscal do cliente') r", ["00000000-0000-0000-0000-000000000000"]));
ok("ADMIN: casa inexistente devolve 'não informado' sem erro de SQL", !r.err && r.rows[0].r.set === false, r.err);
ok("LOG: o admin não consegue alterar nem apagar o log de acesso", !!(await adm((c) => q(c, "delete from tax_id_access_log"))).err && !!(await adm((c) => q(c, "update tax_id_access_log set reason='x'"))).err);

// ================= 3) CORRIDAS =================
const C = await mk("c", "maximo", { billing: billingDayFor(-10) });
await sv("select public.tax_id_store($1,$2,$3,true)", [C.H, cpfOf("222333444"), C.O]);
const issueOn = async () => { const c = await connect(name); try { return await q(c, "select public.platform_seat_issue($1) id", [C.H]); } finally { await c.end(); } };
let rs = await Promise.all(Array.from({ length: 8 }, issueOn));
const ids = new Set(rs.filter((x) => !x.err).map((x) => x.rows[0].id));
ok("CORRIDA: 8 pedidos simultâneos de vaga geram 1 fatura aberta", ids.size === 1 && await cnt("select count(*)::int n from platform_charges where house_id=$1 and kind='extra_seat' and status='aberta'", [C.H]) === 1, `${ids.size} faturas; erros=${rs.filter((x) => x.err).map((x) => x.err).join("|")}`);
const idC = [...ids][0]; const amtC = Number((await sv("select amount_cents from platform_charges where id=$1", [idC])).rows[0].amount_cents);
const refC = await attach(idC);
rs = await Promise.all(Array.from({ length: 10 }, () => confirmOn(refC, amtC)));
ok("CORRIDA: 10 confirmações simultâneas do mesmo pagamento liberam 1 vaga só", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [C.H]) === 1, rs.filter((x) => x.err).map((x) => x.err).slice(0, 2).join("|"));
{ const SB = await mk("sb", "maximo", { billing: billingDayFor(-10) }); await sv("select public.tax_id_store($1,$2,$3,true)", [SB.H, cpfOf("888999000"), SB.O]);
  const idS = (await sv("select public.platform_seat_issue($1) id", [SB.H])).rows[0].id; const refS = await attach(idS); await confirmOn(refS, Number((await sv("select amount_cents from platform_charges where id=$1", [idS])).rows[0].amount_cents));
  const seqLedger = await cnt("select count(*)::int n from platform_ledger_entries where charge_id=$1", [idS]); const le = await cnt("select count(*)::int n from platform_ledger_entries where charge_id=$1", [idC]);
  const evS = (await sv("select kind, count(*)::int n from platform_billing_events where charge_id=$1 group by 1 order by 1", [idS])).rows; const ev = (await sv("select kind, count(*)::int n from platform_billing_events where charge_id=$1 group by 1 order by 1", [idC])).rows;
  ok("CORRIDA: 10 confirmações simultâneas deixam o mesmo livro e os mesmos eventos de 1 confirmação", le === seqLedger && JSON.stringify(ev) === JSON.stringify(evS), `livro ${le} vs ${seqLedger}; eventos ${JSON.stringify(ev)} vs ${JSON.stringify(evS)}`); }
ok("CORRIDA: a fatura termina paga", (await sv("select status from platform_charges where id=$1", [idC])).rows[0].status === "paga");
await confirmOn(refC, amtC + 500);
ok("REPLAY: confirmar de novo com outro valor não libera nada", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [C.H]) === 1);
const D = await mk("d", "maximo", { billing: billingDayFor(-10) });
await sv("select public.tax_id_store($1,$2,$3,true)", [D.H, cpfOf("333444555"), D.O]);
const idD = (await sv("select public.platform_seat_issue($1) id", [D.H])).rows[0].id; const amtD = Number((await sv("select amount_cents from platform_charges where id=$1", [idD])).rows[0].amount_cents);
const refD = await attach(idD);
for (const wrong of [1, amtD - 1, amtD + 1, 0, -amtD]) await confirmOn(refD, wrong);
ok("VALOR: pagamento com valor diferente do cobrado nunca libera a vaga", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [D.H]) === 0 && (await sv("select status from platform_charges where id=$1", [idD])).rows[0].status !== "paga");
r = await sv("select public.platform_charge_confirm('stripe','ref-que-nao-existe',100::bigint,59)");
ok("VALOR: referência inexistente não gera erro técnico", !r.err || !/syntax|null value|relation/i.test(r.err), r.err ?? "sem erro");
await force("update platform_charges set status='cancelada' where id=$1", [idD]);
await confirmOn(refD, amtD);
ok("ESTADO: pagamento chegando para fatura cancelada não libera vaga", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [D.H]) === 0);
const E = await mk("e", "maximo", { billing: billingDayFor(-10) });
const docs = Array.from({ length: 6 }, (_, i) => cpfOf(String(400000000 + i * 1111)));
const setOn = async (d) => { const c = await connect(name); try { await c.query("select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)", [E.O]); await c.query("set role authenticated"); return await q(c, "select public.my_tax_id_set($1) r", [d]); } finally { await c.end(); } };
rs = await Promise.all(docs.map(setOn));
ok("CORRIDA: 6 envios simultâneos de documento — só 1 vence, sem erro técnico", rs.filter((x) => !x.err).length === 1 && rs.filter((x) => x.err).every((x) => /já foi informado/.test(x.err)) && await cnt("select count(*)::int n from house_tax_ids where house_id=$1", [E.H]) === 1, rs.map((x) => x.err ?? "ok").join(" | "));
ok("CORRIDA: um só evento 'documento_informado'", await cnt("select count(*)::int n from platform_billing_events where kind='documento_informado' and reason like $1", [E.H + "%"]) === 1);
const F = await mk("f", "maximo", { billing: billingDayFor(2) });
await sv("insert into house_extra_seats(house_id, seats) values ($1, 3)", [F.H]);
const sched = async (k) => { const c = await connect(name); try { await c.query("select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)", [F.O]); await c.query("set role authenticated"); return await q(c, "select public.my_seat_release_schedule($1) r", [k]); } finally { await c.end(); } };
await Promise.all([sched(0), sched(1), sched(2), sched(0), sched(1)]);
const fs_ = (await sv("select * from house_extra_seats where house_id=$1", [F.H])).rows[0];
ok("CORRIDA: agendamentos simultâneos deixam estado coerente (release_to < seats)", fs_.seats === 3 && fs_.release_to !== null && fs_.release_to < 3 && fs_.release_on !== null, JSON.stringify(fs_));
const ronF = fs_.release_on; const applyOn = async () => { const c = await connect(name); try { return await q(c, "select public.platform_seat_release_apply_due($1::timestamptz) n", [new Date(ronF).toISOString().slice(0, 10) + "T15:00:00Z"]); } finally { await c.end(); } };
await Promise.all([applyOn(), applyOn(), applyOn()]);
const after = (await sv("select * from house_extra_seats where house_id=$1", [F.H])).rows[0];
//console.log("(debug notifs)", JSON.stringify((await sv("select text from notifications where user_id=$1", [F.O])).rows), JSON.stringify((await sv("select kind, amount_cents from platform_ledger_entries where charge_id=$1", [idC])).rows));
//console.log("(debug redução)", JSON.stringify({ before: fs_, after }), await cnt("select count(*)::int n from notifications where user_id=$1", [F.O]));
ok("CORRIDA: aplicar a redução 3x ao mesmo tempo aplica uma vez só", after.seats === fs_.release_to && after.release_on === null && await cnt("select count(*)::int n from notifications where user_id=$1 and text like 'As vagas extras de equipe foram reduzidas%'", [F.O]) === 1, JSON.stringify(after));

// ================= 4) LIMITES E INVARIANTES =================
const G = await mk("g", "maximo", { billing: billingDayFor(-10) });
for (const bad_ of [-1, 21, 1000]) { const rr = await adm((c) => q(c, "select public.admin_set_house_seats($1,$2)", [G.H, bad_])); ok(`LIMITE: admin não passa de 0–20 vagas (${bad_})`, !!rr.err, rr.err); }
await adm((c) => q(c, "select public.admin_set_house_seats($1,20)", [G.H]));
await sv("select public.tax_id_store($1,$2,$3,true)", [G.H, cpfOf("555666777"), G.O]);
r = await sv("select public.platform_seat_issue($1)", [G.H]);
ok("LIMITE: com 20 vagas extras não emite a 21ª", !!r.err && /limite de 20/.test(r.err), r.err);
for (const k of [-1, null, 2147483647, 99]) { const rr = await as(F.O, (c) => q(c, "select public.my_seat_release_schedule($1)", [k])); ok(`HOSTIL: release_schedule(${k}) é recusado`, !!rr.err && !/syntax|overflow|relation/i.test(rr.err), rr.err); }
const NP = await mk("np", "maximo");
await sv("select public.tax_id_store($1,$2,$3,true)", [NP.H, cpfOf("666777888"), NP.O]);
r = await sv("select public.platform_seat_issue($1)", [NP.H]);
ok("ESTADO: casa sem plano contratado não emite vaga nem valor nulo", !!r.err || (await cnt("select count(*)::int n from platform_charges where house_id=$1 and amount_cents is null", [NP.H])) === 0, r.err ?? "emitiu");
ok("ESTADO: casa sem plano contratado não gera nenhuma fatura de vaga", await cnt("select count(*)::int n from platform_charges where house_id=$1", [NP.H]) === 0, r.err);
r = await sv("select public.platform_seat_issue($1)", ["00000000-0000-0000-0000-000000000000"]);
ok("ESTADO: casa inexistente é recusada", !!r.err, r.err);
const NODOC = await mk("nd", "base", { billing: billingDayFor(-10) });
const NEW = await mk("nw", "base"); // sem assinatura: é o caso da contratação
for (const [label, sql, h] of [["vaga", "select public.platform_seat_issue($1)", NODOC.H], ["upgrade", "select public.platform_upgrade_issue($1,'maximo')", NODOC.H], ["contratação", "select public.platform_subscribe_issue($1,'maximo')", NEW.H]]) {
  const rr = await sv(sql, [h]); ok(`DOCUMENTO: ${label} sem CPF/CNPJ é recusada`, !!rr.err && /CPF ou CNPJ|[Ii]nforme/.test(rr.err), rr.err);
}
ok("DOCUMENTO: nenhuma fatura criada para as casas sem documento", await cnt("select count(*)::int n from platform_charges where house_id in ($1,$2)", [NODOC.H, NEW.H]) === 0);
// CNPJ alfanumérico (formato novo da Receita): aceito, guardado em maiúsculas, mascarado e lido pelo admin
const ALN = await mk("aln", "maximo", { billing: billingDayFor(-10) });
const alnDoc = cnpjOf("ab12cd34ef56".toUpperCase()); const alnIn = alnDoc.slice(0, 2).toLowerCase() + "." + alnDoc.slice(2, 5).toLowerCase() + "." + alnDoc.slice(5, 8).toLowerCase() + "/" + alnDoc.slice(8, 12).toLowerCase() + "-" + alnDoc.slice(12);
r = await as(ALN.O, (c) => q(c, "select public.my_tax_id_set($1) r", [alnIn]));
ok("CNPJ ALFANUMÉRICO: válido, em minúsculas e com máscara, é aceito", !r.err && r.rows[0].r.kind === "cnpj", r.err);
const stA = (await as(ALN.O, (c) => q(c, "select public.my_tax_id_status() s"))).rows[0].s;
ok("CNPJ ALFANUMÉRICO: o app só vê o final mascarado", stA.masked === `**.***.***/****-${alnDoc.slice(12)}` && !JSON.stringify(stA).includes(alnDoc.slice(0, 8)), JSON.stringify(stA));
r = await adm((c) => q(c, "select public.admin_house_tax_id($1,'conferir nota fiscal do cliente') r", [ALN.H]));
ok("CNPJ ALFANUMÉRICO: admin lê formatado (XX.XXX.XXX/XXXX-DD) em maiúsculas", !r.err && r.rows[0].r.doc === `${alnDoc.slice(0, 2)}.${alnDoc.slice(2, 5)}.${alnDoc.slice(5, 8)}/${alnDoc.slice(8, 12)}-${alnDoc.slice(12)}`, r.err ?? r.rows[0].r.doc);
ok("CNPJ ALFANUMÉRICO: o exemplo oficial da Receita (12.ABC.345/01DE-35) é válido", (await sv("select public.tax_id_kind('12.ABC.345/01DE-35') k")).rows[0].k === "cnpj");
ok("CNPJ ALFANUMÉRICO: números antigos (só dígitos) continuam válidos", (await sv("select public.tax_id_kind($1) k", [goodCnpj])).rows[0].k === "cnpj");
// permissões endurecidas pela 0127
ok("PERM: house_seat_allowance fechada para anon", !!(await anon((c) => q(c, "select public.house_seat_allowance($1)", [A.H]))).err);
ok("PERM: usuário logado ainda consegue house_seat_allowance (o app usa)", !(await as(A.O, (c) => q(c, "select public.house_seat_allowance($1)", [A.H]))).err);
ok("PERM: cliente sem privilégio de escrita em house_extra_seats e platform_settings", (await sv("select has_table_privilege('anon','house_extra_seats','insert,update,delete') a, has_table_privilege('authenticated','house_extra_seats','insert,update,delete') b, has_table_privilege('anon','platform_settings','insert,update,delete') c, has_table_privilege('authenticated','platform_settings','insert,update,delete') d")).rows[0].a === false);
const tk = await sv("select public.platform_billing_tick(now())");
ok("COMPAT: a rotina diária roda sem erro com casas sem documento", !tk.err, tk.err);
const cfg = (await sv("select value from platform_settings where key='billing_config'")).rows[0].value;
await as(A.O, (c) => q(c, "update platform_settings set value = jsonb_set(value,'{total_block_days}','0') where key='billing_config'"));
ok("30 DIAS: usuário comum não altera a configuração de cobrança", (await sv("select value->>'total_block_days' d from platform_settings where key='billing_config'")).rows[0].d === String(cfg.total_block_days));

await su.end();
console.log(`\n${total - bad}/${total} passaram`);
process.exit(bad ? 1 : 0);

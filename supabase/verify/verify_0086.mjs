// Verificação LOCAL da migration 0086 (painel financeiro da administração): aplica 0001–0086 num PostgreSQL 16 e ataca.
// Uso: node supabase/verify/verify_0086.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0086", { with64: true, max: 86 });
ok("migrations 0001–0086 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(readFileSync(new URL("../migrations/0086_painel_financeiro_admin.sql", import.meta.url), "utf8").split("-- ============ 3) permissões ============")[1]);
const as = async (role, uid, fn) => { const c = await connect("vf0086"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const ADM = "a1000000-0000-0000-0000-0000000000a1", USR = "c0000000-0000-0000-0000-00000000000c";
await su.query("insert into auth.users(id,email) values ($1,'adm@x'),($2,'usr@x')", [ADM, USR]);
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);

// semente: sem chaves estrangeiras e sem gatilhos (para fabricar estados quebrados de propósito)
for (const t of ["payments", "ledger_entries", "refund_requests"]) {
  const k = (await su.query("select conname from pg_constraint where conrelid=$1::regclass and contype='f'", [`public.${t}`])).rows;
  for (const { conname } of k) await su.query(`alter table public.${t} drop constraint ${conname}`);
}
await su.query("alter table public.payments alter column reservation_id drop not null");
await su.query("set session_replication_role = replica");
const H = "b0000000-0000-0000-0000-00000000000b";
const mk = async ({ src = "order_id", gross, fee, status, ver = "v2-2026-10", pf = null, confirmedAgo = null, createdAgo = "0 days" }) =>
  (await su.query(`insert into public.payments (${src}, provider, gross_cents, fee_cents, fee_rule_version, status, processor_fee_cents, confirmed_at, created_at)
    values (gen_random_uuid(), 'stripe', $1, $2, $3, $4, $5, case when $6::text is null then null else now() - $6::interval end, now() - $7::interval) returning id`, [gross, fee, ver, status, pf, confirmedAgo, createdAgo])).rows[0].id;
const led = (pid, rows) => Promise.all(rows.map(([t, a]) => su.query("insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents) values ($1,$2,$3,$4)", [pid, H, t, a])));
const A = await mk({ gross: 20000, fee: 800, status: "confirmado", pf: 837, confirmedAgo: "1 hour" }); await led(A, [["bruto", 20000], ["plataforma", 800], ["casa", 19200], ["taxa_provedor", 837]]);
const B = await mk({ gross: 5000, fee: 200, status: "confirmado", pf: 10, confirmedAgo: "1 hour" });
const C = await mk({ gross: 10000, fee: 400, status: "confirmado", pf: 5, confirmedAgo: "1 hour" }); await led(C, [["bruto", 10000], ["plataforma", 400], ["casa", 9000], ["taxa_provedor", 5]]);
const D = await mk({ gross: 20000, fee: 800, status: "estornado", pf: 837 }); await led(D, [["bruto", 20000], ["bruto", -20000], ["plataforma", 800], ["plataforma", -800], ["casa", 19200], ["casa", -19200], ["taxa_provedor", 837]]);
const E = await mk({ gross: 20000, fee: 800, status: "estornado", pf: 837 }); await led(E, [["bruto", 20000], ["bruto", -20000], ["plataforma", 800], ["casa", 19200], ["taxa_provedor", 837]]);
const F = await mk({ gross: 100, fee: 4, status: "falhou" }); await led(F, [["bruto", 100]]);
const G = await mk({ gross: 10000, fee: 999, status: "confirmado", pf: 1, confirmedAgo: "1 hour" }); await led(G, [["bruto", 10000], ["plataforma", 999], ["casa", 9001], ["taxa_provedor", 1]]);
const Hh = await mk({ gross: 10000, fee: 400, status: "falhou", ver: "nope" });
const I = await mk({ gross: 10000, fee: 400, status: "contestado", pf: 50 }); await led(I, [["bruto", 10000], ["plataforma", 400], ["casa", 9600], ["taxa_provedor", 50]]);
const J = await mk({ gross: 10000, fee: 400, status: "confirmado", pf: null, confirmedAgo: "3 days" }); await led(J, [["bruto", 10000], ["plataforma", 400], ["casa", 9600]]);
const K = await mk({ gross: 10000, fee: 400, status: "confirmado", pf: null, confirmedAgo: "1 hour" }); await led(K, [["bruto", 10000], ["plataforma", 400], ["casa", 9600]]);
const L = await mk({ gross: 100, fee: 4, status: "pendente", createdAgo: "2 days" });
const L2 = await mk({ gross: 100, fee: 4, status: "pendente" });
const M = await mk({ gross: 10000, fee: 400, status: "confirmado", pf: 100, confirmedAgo: "1 hour" }); await led(M, [["bruto", 10000], ["plataforma", 400], ["casa", 9600], ["taxa_provedor", 99]]);
const R = await mk({ src: "reservation_id", gross: 10000, fee: 1500, status: "confirmado", pf: 10, confirmedAgo: "1 hour" }); await led(R, [["bruto", 10000], ["plataforma", 1500], ["casa", 8500], ["taxa_provedor", 10]]);
const R2 = await mk({ src: "reservation_id", gross: 10000, fee: 400, status: "confirmado", pf: 10, confirmedAgo: "1 hour" }); await led(R2, [["bruto", 10000], ["plataforma", 400], ["casa", 9600], ["taxa_provedor", 10]]);
const NC = await mk({ gross: 10000, fee: null, status: "confirmado", pf: 1, confirmedAgo: "1 hour" });
const ND = await mk({ gross: 10000, fee: 400, status: "confirmado", pf: 1 }); await led(ND, [["bruto", 10000], ["plataforma", 400], ["casa", 9600], ["taxa_provedor", 1]]);
const rr = (pid, status, ago) => su.query("insert into public.refund_requests (payment_id, house_id, client_id, kind, amount_cents, status, created_at, completed_at) values ($1,$2,$3,'antes_do_inicio',100,$4, now() - $5::interval, case when $4='reembolsado' then now() end)", [pid, H, USR, status, ago]);
await rr(L2, "pendente", "5 days"); await rr(A, "reembolsado", "1 day"); await rr(D, "reembolsado", "1 day"); await rr(L, "pendente", "1 hour");
await su.query("set session_replication_role = default");

const fin = (fn, args = []) => as("authenticated", ADM, (c) => q(c, `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`, args));
let r = await fin("admin_finance_anomalies");
const an = r.rows?.[0]?.r; ok("conferência executa para o administrador", !!an && !r.err, r.err);
const by = (code) => (an?.items ?? []).filter((i) => i.code === code).map((i) => i.payment_id).sort();
const only = (code, ids) => JSON.stringify(by(code)) === JSON.stringify([...ids].sort());
ok("confirmado sem lançamentos: B e NC (sem comissão nem livro)", only("confirmado_sem_lancamentos", [B, NC]), by("confirmado_sem_lancamentos"));
ok("lançamentos não fecham: só o C (casa errada)", only("lancamentos_nao_fecham", [C]), by("lancamentos_nao_fecham"));
ok("estorno não zerou: só o E", only("estorno_nao_zerou", [E]), by("estorno_nao_zerou"));
ok("lançamentos em cobrança falha: só o F", only("lancamentos_sem_cobranca", [F]), by("lancamentos_sem_cobranca"));
ok("comissão diverge da regra: G (999≠400), R2 (ritual 400≠1500) e Hh não (regra ausente)", only("comissao_diverge_da_regra", [G, R2, NC]), by("comissao_diverge_da_regra"));
ok("regra ausente: só o Hh", only("regra_ausente", [Hh]), by("regra_ausente"));
ok("contestado: só o I", only("contestado", [I]), by("contestado"));
ok("tarifa pendente há mais de 2 dias: só o J (K é recente)", only("tarifa_do_provedor_pendente", [J]), by("tarifa_do_provedor_pendente"));
ok("comissão ausente: só o NC", only("comissao_ausente", [NC]), by("comissao_ausente"));
ok("tarifa diverge do livro: só o M", only("tarifa_diverge_do_livro", [M]), by("tarifa_diverge_do_livro"));
ok("confirmado sem data: ND", only("confirmado_sem_data", [ND]), by("confirmado_sem_data"));
ok("pendente antigo: só o L", only("pendente_antigo", [L]), by("pendente_antigo"));
ok("reembolso parado: só o pedido do L2 (5 dias)", only("reembolso_parado", [L2]), by("reembolso_parado"));
ok("reembolso concluído com pagamento confirmado: só o A", only("reembolso_sem_estorno", [A]), by("reembolso_sem_estorno"));
ok("pagamentos corretos (A bom, D estornado correto, K recente, L2 novo) não aparecem em lugar nenhum além do esperado",
  !(an.items.some((i) => i.payment_id === D)) && !(an.items.some((i) => i.payment_id === K)) && an.items.filter((i) => i.payment_id === A).length === 1 && an.items.filter((i) => i.payment_id === A)[0].code === "reembolso_sem_estorno", JSON.stringify(an.items.filter((i) => [A, D, K].includes(i.payment_id)).map((i) => i.code)));
ok("ordem: altas antes de médias antes de baixas", (() => { const o = { alta: 0, media: 1, baixa: 2 }; const v = an.items.map((i) => o[i.severity]); return v.every((x, i) => i === 0 || v[i - 1] <= x); })());
ok("total e contagem por código coerentes", an.total === an.items.length && Object.values(an.counts).reduce((a, b) => a + b, 0) === an.total, JSON.stringify(an.counts));
ok("traz o escopo (não consulta o Stripe)", /Não consulta o Stripe/.test(an.scope ?? ""));

// resumo
r = await fin("admin_finance_summary", [30]);
const sm = r.rows?.[0]?.r; ok("resumo executa", !!sm && !r.err, r.err);
ok("resumo: contagem de pagamentos e confirmados", sm?.totals.payments === 18 && sm.totals.confirmed_n === 11, JSON.stringify(sm?.totals));
ok("resumo: bruto confirmado e comissão em centavos inteiros", sm?.totals.confirmed_gross_cents === 115000 && sm.totals.platform_fee_cents === 5899 && sm.totals.processor_fee_known_cents === 975, JSON.stringify(sm?.totals));
ok("resumo: tarifa pendente conta confirmados sem tarifa", sm?.totals.processor_fee_pending_n === 2, JSON.stringify(sm?.totals));
ok("resumo: estornados 2, contestado 1, falhou 2, pendente 2", sm?.totals.refunded_n === 2 && sm.totals.contested_n === 1 && sm.totals.failed_n === 2 && sm.totals.pending_n === 2, JSON.stringify(sm?.totals));
ok("resumo: por tipo traz ritual e servico", sm?.by_kind.some((x) => x.kind === "ritual" && x.n === 2) && sm.by_kind.some((x) => x.kind === "servico"), JSON.stringify(sm?.by_kind));
ok("resumo: reembolsos abertos 2 e mais antigo 5 dias", sm?.refunds.open_n === 2 && sm.refunds.open_oldest_days === 5, JSON.stringify(sm?.refunds));
ok("resumo informa a regra vigente", sm?.fee_rule_version === "v2-2026-10");
r = await fin("admin_finance_summary", [1]); ok("período de 1 dia filtra pelos criados hoje (L, D, etc. de 'agora')", r.rows?.[0]?.r.totals.payments === 17 && r.rows[0].r.days === 1, JSON.stringify(r.rows?.[0]?.r.totals));
for (const [inp, want] of [[0, 1], [-5, 1], [99999, 365], [null, 30]]) { r = await fin("admin_finance_summary", [inp]); ok(`período ${inp} vira ${want}`, r.rows?.[0]?.r.days === want, r.err); }

// segurança
for (const fn of ["admin_finance_summary(int)", "admin_finance_anomalies()"]) {
  const x = async (role) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, `public.${fn}`])).rows[0].x;
  ok(`anon não executa ${fn}`, !(await x("anon")));
}
r = await as("authenticated", USR, (c) => q(c, "select public.admin_finance_summary(30)")); ok("usuário comum não executa o resumo", !!r.err && /not_admin/.test(r.err), r.err);
r = await as("authenticated", USR, (c) => q(c, "select public.admin_finance_anomalies()")); ok("usuário comum não executa a conferência", !!r.err && /not_admin/.test(r.err), r.err);
r = await as("authenticated", null, (c) => q(c, "select public.admin_finance_summary(30)")); ok("sem login não executa", !!r.err, r.err);
r = await as("anon", null, (c) => q(c, "select public.admin_finance_summary(30)")); ok("anon recebe negação", !!r.err, r.err);
r = await as("authenticated", USR, (c) => q(c, "select count(*) n from public.payments")); ok("usuário comum segue sem ler pagamentos de terceiros (RLS inalterada)", (r.rows?.[0]?.n ?? "0") === "0", JSON.stringify(r));
r = await q(su, "select count(*) n from public.admin_audit where key='finance_view'");
ok("cada consulta do administrador ficou registrada (6 resumos + 1 conferência; negadas não registram)", Number(r.rows[0].n) === 7, r.rows[0].n);
r = await q(su, "select count(*) n from public.admin_audit where key='finance_view' and admin_id=$1", [ADM]); ok("registro traz o administrador certo", Number(r.rows[0].n) === 7);

// limite de 200 itens
await su.query("set session_replication_role = replica");
for (let i = 0; i < 230; i++) await mk({ gross: 100, fee: 4, status: "pendente", createdAgo: "3 days" });
await su.query("set session_replication_role = default");
r = await fin("admin_finance_anomalies"); const big = r.rows?.[0]?.r;
ok("com muitas anomalias mostra no máximo 200, mas informa o total", big?.shown === 200 && big.total >= 230 && big.items.length === 200, `${big?.shown}/${big?.total}`);
ok("os 200 mostrados priorizam as altas", big?.items.slice(0, 5).every((i) => i.severity === "alta"));
await su.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);

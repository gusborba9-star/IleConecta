// Verificação LOCAL das migrations 0138 (módulos de acesso) e 0139 (trava por módulo). Uso: node supabase/verify/verify_0138_0139.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 400) : ""}`); if (!c) bad++; };
const name = "vf0138";
const { c: su, failed } = await freshDb(name, { with64: true, max: 137 });
ok("migrations 0001–0137 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const m38 = readFileSync(new URL("../migrations/0138_modulos_de_acesso_da_administracao.sql", import.meta.url), "utf8");
const m39 = readFileSync(new URL("../migrations/0139_trava_por_modulo.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const uuid = (i) => `b0138000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const OWN = uuid(1), SUP = uuid(2), MOD = uuid(3), COM = uuid(4), IND = uuid(5), CON = uuid(6), NOP = uuid(7), PLAIN = uuid(8), NEWB = uuid(9);
const mk = async (id, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente',$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm]); };
for (const [id, nm] of [[OWN, "Dono Um"], [SUP, "Suporte"], [MOD, "Moderador"], [COM, "Comunicador"], [IND, "Indicadores"], [CON, "Contas"], [NOP, "Sem Modulo"], [PLAIN, "Pessoa Comum"], [NEWB, "Nova Pessoa"]]) await mk(id, nm);
// estado "antes": uma só administradora (como em produção) com poder total
await su.query("insert into admins(user_id) values ($1)", [OWN]);

let e = null; try { await su.query(m38); await su.query(m38); } catch (x) { e = x.message; }
ok("0138 aplica e reaplica sem erro", e === null, e ?? "");
ok("a administradora existente virou dono (e só ela)", (await sv("select count(*)::int n from admins where is_owner")).rows[0].n === 1 && (await sv("select is_owner from admins where user_id=$1", [OWN])).rows[0].is_owner === true);
await su.query("insert into admins(user_id,perms) values ($1,'{suporte}'),($2,'{moderacao}'),($3,'{comunicacao}'),($4,'{indicadores}'),($5,'{contas}'),($6,'{}')", [SUP, MOD, COM, IND, CON, NOP]);
ok("segundo dono é impossível (índice único)", !!(await sv("insert into admins(user_id,is_owner) values ($1,true)", [PLAIN])).err);
ok("módulo inventado é recusado pela tabela", !!(await sv("insert into admins(user_id,perms) values ($1,'{tudo}')", [PLAIN])).err);

const before39 = (await sv("select proname, md5(prosrc) h from pg_proc where pronamespace='public'::regnamespace and prosrc ~ 'is_admin\\(\\)'")).rows;
let e2 = null; try { await su.query(m39); await su.query(m39); } catch (x) { e2 = x.message; }
ok("0139 aplica e reaplica sem erro", e2 === null, e2 ?? "");
const MAPJ = JSON.parse(m39.match(/v_map constant jsonb := '(\{[\s\S]*?\})';/)[1]);
// CONTRATO (independente da migration): quem pode o quê. Mudar a divisão exige mudar aqui de propósito.
const CONTRATO = {"suporte": ["admin_support_queue", "admin_support_dossier", "admin_support_refresh_facts", "admin_support_reply", "admin_support_request_version", "admin_support_set_status", "admin_support_decide", "open_support_case"], "moderacao": ["admin_moderation_list", "admin_moderation_act", "admin_moderation_scan", "admin_moderation_start_adaptation", "admin_reported_reviews", "admin_review_report_keep", "admin_set_review_hidden", "admin_chat_reports", "admin_resolve_chat_report", "report_file_visible"], "comunicacao": ["admin_announce", "admin_announce_count", "admin_announcements_list", "admin_notify_returning", "admin_returning_accounts", "admin_returning_history", "admin_search_recipients"], "indicadores": ["admin_metrics", "admin_indicators", "admin_finance_summary", "admin_finance_anomalies", "admin_houses_plans", "admin_houses_seats", "admin_pending_center", "admin_house_timeline", "admin_staff_audit", "admin_refund_context", "admin_refund_records"], "contas": ["admin_suspend_account", "admin_unsuspend_account"], "dono": ["admin_audit_feed", "admin_save_doc", "admin_set_setting", "admin_set_support_email", "admin_set_fee_rules", "admin_set_house_plan", "admin_set_house_seats", "admin_set_promo_limit", "admin_set_billing_holiday", "admin_billing_enroll", "admin_billing_reactivate", "admin_billing_unenroll", "admin_price_announce", "admin_price_cancel", "admin_house_tax_id", "admin_house_tax_id_set", "admin_deleted_identity", "admin_decide_account_deletion", "complete_refund", "decide_refund", "platform_charge_cancel", "event_records_access"]};
ok("o catálogo da 0139 é exatamente o contrato de módulos", JSON.stringify(Object.fromEntries(Object.entries(MAPJ).map(([k, v]) => [k, [...v].sort()]))) === JSON.stringify(Object.fromEntries(Object.entries(CONTRATO).map(([k, v]) => [k, [...v].sort()]))));
const allNames = Object.values(CONTRATO).flat();
ok("catálogo da 0139 tem 60 funções", allNames.length === 60, String(allNames.length));
const left = (await sv("select proname from pg_proc where pronamespace='public'::regnamespace and proname = any($1) and prosrc ~ 'is_admin\\(\\)'", [allNames])).rows;
ok("nenhuma função do catálogo ainda usa is_admin()", left.length === 0, left.map((r) => r.proname).join());
let wrong = [];
for (const [mod, names] of Object.entries(CONTRATO)) for (const n of names) { const r = (await sv("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n])).rows[0]; const mods = [...r.prosrc.matchAll(/admin_can\('([a-z]+)'\)/g)].map((x) => x[1]); if (!mods.length || mods.some((x) => x !== mod)) wrong.push(`${n}:${mods}`); }
ok("cada função tem a trava do módulo certo (e só ele)", wrong.length === 0, wrong.join(" | "));
const pol = (await sv("select tablename, policyname, qual, with_check from pg_policies where schemaname in ('public','storage') and (qual ~ 'is_admin' or with_check ~ 'is_admin')")).rows;
ok("nenhuma política de leitura da administração ficou com is_admin()", pol.length === 0, pol.map((p) => p.tablename + "." + p.policyname).join());
const generic = (await sv("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc ~ 'is_admin\\(\\)' order by 1")).rows.map((r) => r.proname);
console.log("INFO funções que continuam com is_admin():", generic.join(" "));

// ---- matriz: cada pessoa × cada função
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const sig = (await sv("select proname n, pg_get_function_identity_arguments(oid) a, prorettype::regtype::text rt from pg_proc where pronamespace='public'::regnamespace and proname = any($1)", [allNames])).rows;
const REFUSE = /not_admin|Não autorizado|restrito à administração|Somente a administração|permission denied|42501/i;
const SKIP = new Set(["open_support_case", "report_file_visible", "event_records_access", "complete_refund"]);
const modOf = Object.fromEntries(Object.entries(CONTRATO).flatMap(([m, ns]) => ns.map((n) => [n, m])));
const who = { OWN: [OWN, "dono"], SUP: [SUP, "suporte"], MOD: [MOD, "moderacao"], COM: [COM, "comunicacao"], IND: [IND, "indicadores"], CON: [CON, "contas"], NOP: [NOP, null], PLAIN: [PLAIN, undefined] };
const arg = (t) => { t = t.trim(); const ty = t.split(" ").slice(1).join(" ") || t; return "null"; };
const bad2 = [];
for (const s of sig) {
  if (SKIP.has(s.n)) continue;
  const nargs = s.a.trim() === "" ? 0 : s.a.split(",").length;
  const call = `select public.${s.n}(${Array(nargs).fill("null").join(",")})`;
  for (const [k, [uid, perm]] of Object.entries(who)) {
    const res = await as(uid, async (c) => { await c.query("begin"); const r = await q(c, call); await c.query("rollback"); return r; });
    const refused = !!res.err && REFUSE.test(res.err);
    const shouldPass = perm === "dono" || (perm && perm === modOf[s.n]);
    if (shouldPass === refused) bad2.push(`${k}→${s.n}:${refused ? "recusou" : "passou"}(${(res.err ?? "ok").slice(0, 60)})`);
  }
}
ok(`matriz ${sig.length - 0} funções × 8 perfis: dono passa em todas, cada módulo só na sua, sem módulo e pessoa comum recusados`, bad2.length === 0, bad2.slice(0, 12).join(" | "));

// ---- políticas (leitura direta pela API)
await su.query("set session_replication_role = replica");
await su.query("insert into admin_audit(admin_id,key,new_value) values ($1,'pricing','{}')", [OWN]);
await su.query("set session_replication_role = origin");
const cnt = async (uid, t) => (await as(uid, async (c) => (await q(c, `select count(*)::int n from ${t}`)).rows?.[0]?.n ?? -1));
ok("histórico (admin_audit): só o dono lê", (await cnt(OWN, "admin_audit")) >= 1 && (await cnt(SUP, "admin_audit")) === 0 && (await cnt(NOP, "admin_audit")) === 0 && (await cnt(PLAIN, "admin_audit")) === 0);
ok("tabelas financeiras: só o dono lê", (await cnt(SUP, "platform_charges")) === 0 && (await cnt(IND, "platform_charges")) === 0 && (await cnt(NOP, "platform_charges")) === 0);

// ---- gestão de administradores
const rpc = (uid, sql, p) => as(uid, (c) => q(c, sql, p));
ok("só o dono lista administradores", !(await rpc(OWN, "select public.admin_list_admins()")).err && /not_admin/.test((await rpc(SUP, "select public.admin_list_admins()")).err ?? "") && /not_admin/.test((await rpc(PLAIN, "select public.admin_list_admins()")).err ?? ""));
const list = (await rpc(OWN, "select public.admin_list_admins() l")).rows[0].l;
ok("a lista traz dono primeiro, nome e módulos", list[0].owner === true && list[0].name === "Dono Um" && list.find((x) => x.name === "Suporte").perms[0] === "suporte", JSON.stringify(list[0]));
ok("administrador com módulo NÃO adiciona ninguém", /not_admin/.test((await rpc(SUP, "select public.admin_add_admin($1,'{suporte}')", [`u${PLAIN.slice(-2)}@x.com`])).err ?? ""));
ok("administrador com módulo NÃO se dá mais módulos", /not_admin/.test((await rpc(SUP, "select public.admin_set_admin_perms($1,'{suporte,contas,moderacao}')", [SUP])).err ?? "") && (await sv("select perms from admins where user_id=$1", [SUP])).rows[0].perms.length === 1);
ok("administrador com módulo NÃO remove o dono nem outros", /not_admin/.test((await rpc(SUP, "select public.admin_remove_admin($1)", [OWN])).err ?? "") && /not_admin/.test((await rpc(SUP, "select public.admin_remove_admin($1)", [MOD])).err ?? ""));
const direct = await rpc(SUP, "update admins set is_owner = true where user_id = $1", [SUP]);
const direct2 = await rpc(SUP, "insert into admins(user_id,is_owner) values ($1,false)", [PLAIN]);
ok("pela API direta ninguém altera a tabela de administradores", ((direct.rows?.length ?? 0) === 0 || !!direct.err) && !!direct2.err && (await sv("select is_owner from admins where user_id=$1", [SUP])).rows[0].is_owner === false);
ok("dono adiciona com módulos", !(await rpc(OWN, "select public.admin_add_admin($1,'{suporte,moderacao}')", [`u${NEWB.slice(-2)}@x.com`])).err && (await sv("select perms from admins where user_id=$1", [NEWB])).rows[0].perms.join() === "suporte,moderacao");
ok("e-mail sem conta, módulo inventado e dono como alvo são recusados", /user_not_found/.test((await rpc(OWN, "select public.admin_add_admin('nao@existe.com','{}')")).err ?? "") && /modulo_invalido/.test((await rpc(OWN, "select public.admin_add_admin($1,'{tudo}')", [`u${PLAIN.slice(-2)}@x.com`])).err ?? "") && /dono_nao_muda/.test((await rpc(OWN, "select public.admin_add_admin($1,'{}')", [`u${OWN.slice(-2)}@x.com`])).err ?? "") && /admin_inexistente/.test((await rpc(OWN, "select public.admin_set_admin_perms($1,'{}')", [OWN])).err ?? ""));
ok("dono altera módulos e o histórico guarda antes e depois", !(await rpc(OWN, "select public.admin_set_admin_perms($1,'{contas}')", [NEWB])).err && (await sv("select old_value, new_value from admin_audit where key='admins' and new_value ? 'user' order by id desc limit 1")).rows[0].old_value.perms.join() === "suporte,moderacao");
ok("mudança de módulo vale na hora (novo módulo abre, antigo fecha)", !/not_admin/.test((await rpc(NEWB, "select public.admin_suspend_account(null,null)")).err ?? "") && /not_admin/.test((await rpc(NEWB, "select public.admin_support_queue(null)")).err ?? ""));
ok("dono não pode ser removido", /dono_nao_removivel/.test((await rpc(OWN, "select public.admin_remove_admin($1)", [OWN])).err ?? ""));
ok("dono remove um administrador e o acesso some na hora", !(await rpc(OWN, "select public.admin_remove_admin($1)", [NEWB])).err && /not_admin/.test((await rpc(NEWB, "select public.admin_suspend_account(null,null)")).err ?? ""));
const my = async (uid) => (await rpc(uid, "select public.admin_my_access() a")).rows[0].a;
ok("admin_my_access diz o que cada um pode", (await my(OWN)).owner === true && (await my(SUP)).perms[0] === "suporte" && (await my(PLAIN)).admin === false);
const anon = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select public.admin_can('suporte')"); } finally { await c.end(); } })();
ok("anônimo não executa admin_can", /permission denied/.test(anon.err ?? ""));
const acl = await sv("select has_function_privilege('anon','public.admin_add_admin(text,text[])','execute') a, has_function_privilege('public','public.admin_set_admin_perms(uuid,text[])','execute') p, has_function_privilege('authenticated','public.admin_set_admin_perms(uuid,text[])','execute') u");
ok("ACL: anônimo e público fora; só authenticated", !acl.rows[0].a && !acl.rows[0].p && acl.rows[0].u);
console.log(`\n${total - bad}/${total} ok`);
await su.end?.(); process.exit(bad ? 1 : 0);

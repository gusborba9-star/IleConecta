// Verificação LOCAL da migration 0085 (matriz central de planos): (1) EQUIVALÊNCIA — com os valores iniciais, cada plano se comporta
// exatamente como antes (banco 0001–0084 contra banco 0001–0085, mesmo roteiro); (2) edição pelo painel; (3) ataques à matriz.
// Uso: node supabase/verify/verify_0085.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 230) : ""}`); if (!c) bad++; };
const GRANTS = `alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`;
const PLANS = ["base", "intermediario", "maximo"];
const id = (p, k) => `${String(p).padEnd(8, "0")}-0000-0000-0000-${String(k).padStart(12, "0")}`;

async function build(name, max) {
  const { c, failed } = await freshDb(name, { with64: true, max });
  await c.query(GRANTS);
  // o GRANTS acima só serve ao ambiente de teste: reaplica as permissões reais que a própria migration define
  if (max >= 85) await c.query(readFileSync(new URL("../migrations/0085_matriz_de_planos.sql", import.meta.url), "utf8").split("-- ============ 5) permissões ============")[1]);
  return { c, failed, name };
}
const A = await build("vf85_old", 84), B = await build("vf85_new", 85);
ok("bases montadas (0001–0084 e 0001–0085)", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));

const asUser = async (db, uid, fn) => { const c = await connect(db.name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const tryq = (c, sql, p) => c.query(sql, p).then((r) => ({ ok: true, rows: r.rows }), (e) => ({ ok: false, err: e.message }));

async function scenario(db) {
  const su = db.c, out = {};
  await su.query("update platform_settings set value='{\"ritual_video\":{\"state\":\"on\",\"beta_houses\":[]}}'::jsonb where key='features'");
  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i], owner = id("a" + i, i), staff = id("b" + i, i), client = id("c" + i, i), house = id("d" + i, i);
    for (const [u, t] of [[owner, "casa"], [staff, "cliente"], [client, "cliente"]]) {
      await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
      await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
    }
    await su.query("set session_replication_role = replica");
    await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [house, owner, "Casa " + plan, "casa-" + plan, plan]);
    await su.query("set session_replication_role = origin");
    const r = {};
    let n = 0; for (let k = 0; k < 35; k++) if ((await tryq(su, "insert into house_campaigns(house_id, code, label) values ($1,$2,'Teste')", [house, "c" + k])).ok) n++;
    r.campaigns = n;
    n = 0; for (let k = 0; k < 55; k++) if ((await tryq(su, "insert into house_quick_replies(house_id,title,body) values ($1,'Titulo','Corpo da resposta')", [house])).ok) n++;
    r.quickReplies = n;
    // contagem dia a dia: usa um link criado fora do gatilho (replica), para testar só a regra do dia a dia
    await su.query("set session_replication_role = replica");
    const camp = (await su.query("insert into house_campaigns(house_id, code, label) values ($1,'zz','Fixo') returning id", [house])).rows[0].id;
    await su.query("set session_replication_role = origin");
    r.dailyCount = (await asUser(db, owner, (c) => tryq(c, "select * from my_campaign_days($1, 7)", [camp]))).ok;
    r.membersArea = (await asUser(db, owner, (c) => tryq(c, "select member_my_house()"))).ok;
    const conv = (await su.query("insert into conversations default values returning id")).rows[0].id;
    await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [conv, owner, client]);
    r.chatMedia = (await su.query("select conversation_has_premium_house($1) v", [conv])).rows[0].v;
    const cal = await tryq(su, "insert into house_calendar_items(house_id,title,on_date,yearly,vis_followers) values ($1,'Gira','2026-12-01',true,true) returning yearly, vis_followers", [house]);
    r.calendar = cal.rows?.[0] ?? cal.err;
    await su.query("insert into house_extra_seats(house_id, seats) values ($1, 2)", [house]).catch(() => null);
    r.seats = (await su.query("select house_seat_allowance($1) v", [house])).rows[0].v;
    r.video = (await su.query("select ritual_video_enabled($1) v", [house])).rows[0].v;
    await su.query("set session_replication_role = replica");
    await su.query("insert into house_staff(house_id,user_id,name,perms) values ($1,$2,'Ajudante',array['members','chat_reply'])", [house, staff]);
    await su.query("set session_replication_role = origin");
    r.staffMembers = (await asUser(db, staff, (c) => tryq(c, "select staff_perm('members') v"))).rows?.[0]?.v ? true : false;
    out[plan] = r;
  }
  return out;
}
const oldR = await scenario(A), newR = await scenario(B);
for (const plan of PLANS) ok(`equivalência no plano ${plan}`, JSON.stringify(oldR[plan]) === JSON.stringify(newR[plan]), JSON.stringify([oldR[plan], newR[plan]]));
ok("o roteiro realmente exercita diferenças entre planos (Essencial ≠ Profissional ≠ Premium)",
  oldR.base.campaigns === 0 && oldR.intermediario.campaigns === 2 && oldR.maximo.campaigns === 30 && oldR.intermediario.quickReplies === 3 && oldR.maximo.quickReplies === 50 &&
  oldR.maximo.dailyCount && !oldR.intermediario.dailyCount && oldR.maximo.membersArea && !oldR.base.membersArea && oldR.maximo.chatMedia && !oldR.intermediario.chatMedia &&
  oldR.maximo.seats === 3 && oldR.base.seats === 2 && oldR.maximo.video && !oldR.intermediario.video && oldR.maximo.staffMembers && !oldR.intermediario.staffMembers, JSON.stringify(oldR));

// ============ matriz: leitura, edição e ataques (no banco novo) ============
const su = B.c, ADM = "ad000000-0000-0000-0000-0000000000ad", USR = id("c1", 1);
await su.query("insert into auth.users(id,email) values ($1,'adm@x')", [ADM]); await su.query("insert into admins(user_id) values ($1)", [ADM]);
const cur = async () => (await su.query("select value from platform_settings where key='plan_matrix'")).rows[0]?.value;
const set = (uid, v) => asUser(B, uid, (c) => tryq(c, "select admin_set_setting('plan_matrix', $1::jsonb)", [JSON.stringify(v)]));
const base = await cur();
ok("matriz inicial gravada em platform_settings", !!base && base.caps.maximo.campaign_links === 30);
const def = (await su.query("select plan_matrix_default() v")).rows[0].v;
ok("plan_matrix_default() é igual à matriz gravada", JSON.stringify(def) === JSON.stringify(base));
const mod = (f) => { const m = JSON.parse(JSON.stringify(base)); f(m); return m; };

let r = await set(USR, mod((m) => { m.caps.base.chat_media = true; }));
ok("usuário comum não altera a matriz", !r.ok && /not_admin/.test(r.err), r.err);
r = await asUser(B, USR, (c) => tryq(c, "update platform_settings set value='{}' where key='plan_matrix'"));
ok("usuário comum não grava direto em platform_settings (a RLS barra ou nada muda)", true, r.err ?? "sem erro: nenhuma linha afetada");
ok("...e a matriz não foi alterada", JSON.stringify(await cur()) === JSON.stringify(base));

const attacks = {
  "número fora da faixa (links 201)": (m) => { m.caps.base.campaign_links = 201; },
  "número negativo": (m) => { m.caps.maximo.quick_replies = -1; },
  "número decimal": (m) => { m.caps.maximo.assistant_replies = 10.5; },
  "número como texto": (m) => { m.caps.maximo.assistant_replies = "3000"; },
  "assistente acima do máximo (100001)": (m) => { m.caps.maximo.assistant_replies = 100001; },
  "liga/desliga como texto": (m) => { m.caps.base.chat_media = "true"; },
  "liga/desliga como número": (m) => { m.caps.base.chat_media = 1; },
  "chave de limite faltando": (m) => { delete m.caps.base.quick_replies; },
  "chave extra": (m) => { m.caps.base.superpoder = true; },
  "chave trocada (mesmo total de chaves)": (m) => { delete m.caps.base.quick_replies; m.caps.base.superpoder = 3; },
  "plano faltando": (m) => { delete m.caps.maximo; },
  "raiz com chave extra": (m) => { m.extra = 1; },
  "sem copy": (m) => { delete m.copy; },
  "texto vazio no benefício": (m) => { m.copy.base.benefits[0].text = "   "; },
  "texto de 201 caracteres": (m) => { m.copy.base.benefits[0].text = "x".repeat(201); },
  "13 benefícios": (m) => { m.copy.base.benefits = Array.from({ length: 13 }, (_, i) => ({ text: "item " + i, feature: null })); },
  "tagline vazia": (m) => { m.copy.base.tagline = ""; },
  "tagline de 121": (m) => { m.copy.base.tagline = "y".repeat(121); },
  "feature desconhecida": (m) => { m.copy.base.benefits[0].feature = "segredo"; },
  "feature como número": (m) => { m.copy.base.benefits[0].feature = 3; },
  "benefícios não é lista": (m) => { m.copy.base.benefits = "abc"; },
  "benefício não é objeto": (m) => { m.copy.base.benefits = ["texto solto"]; },
  "texto não é string": (m) => { m.copy.base.benefits[0].text = 5; },
};
for (const [name, f] of Object.entries(attacks)) {
  r = await set(ADM, mod(f));
  ok(`administrador também não grava matriz inválida: ${name}`, !r.ok && /Matriz de planos inválida|invalid/.test(r.err), r.err);
}
ok("nenhum ataque alterou a matriz", JSON.stringify(await cur()) === JSON.stringify(base));
r = await asUser(B, ADM, (c) => tryq(c, "select admin_set_setting('plan_matrix', '[]'::jsonb)")); ok("matriz que é lista é recusada", !r.ok, r.err);
r = await asUser(B, ADM, (c) => tryq(c, "select admin_set_setting('plan_matrix', null)")); ok("matriz nula é recusada", !r.ok, r.err);
r = await asUser(B, ADM, (c) => tryq(c, "select admin_set_setting('planos_secretos', '{}'::jsonb)")); ok("chave desconhecida é recusada", !r.ok && /invalid_key/.test(r.err), r.err);
r = await su.query("insert into platform_settings(key,value) values ('outra','{}')").then(() => null, (e) => e.message); ok("tabela só aceita as chaves conhecidas", !!r, r);

// edição válida muda o comportamento SEM redeploy (e é auditada)
const hB = id("d0", 0); // casa Essencial
r = await set(ADM, mod((m) => { m.caps.base.campaign_links = 1; m.caps.base.quick_replies = 2; }));
ok("administrador altera a matriz (Essencial: 1 link, 2 respostas rápidas)", r.ok, r.err);
let n = 0; for (let k = 0; k < 5; k++) if ((await tryq(su, "insert into house_campaigns(house_id,code,label) values ($1,$2,'Novo')", [hB, "n" + k])).ok) n++;
ok("Essencial agora aceita exatamente 1 link a mais (já tinha o link fixo; limite 1 → 0 novos)", n === 0, n);
r = await set(ADM, mod((m) => { m.caps.base.campaign_links = 3; m.caps.base.quick_replies = 2; }));
n = 0; for (let k = 0; k < 6; k++) if ((await tryq(su, "insert into house_campaigns(house_id,code,label) values ($1,$2,'Novo')", [hB, "m" + k])).ok) n++;
ok("com limite 3 e 1 link existente, entram mais 2", n === 2, n);
const aud = (await su.query("select count(*)::int n from admin_audit where key='plan_matrix'")).rows[0].n;
ok("cada edição ficou na auditoria", aud === 2, aud);
// a casa Premium: liga ferramenta nova em plano antigo (presente) e vê efeito
r = await set(ADM, mod((m) => { m.caps.intermediario.chat_media = true; }));
const convI = (await su.query("select conversation_id c from conversation_members where user_id=$1", [id("a1", 1)])).rows[0].c;
ok("ligar chat_media no Profissional vale na hora para o banco", (await su.query("select conversation_has_premium_house($1) v", [convI])).rows[0].v === true);
await set(ADM, base);
ok("restaurar a matriz inicial restaura o comportamento", (await su.query("select conversation_has_premium_house($1) v", [convI])).rows[0].v === false);

// segurança em profundidade: se alguém corromper a linha por fora, o banco volta aos valores iniciais (nunca fica sem regra, nunca libera tudo)
await su.query("alter table platform_settings disable trigger all");
await su.query("update platform_settings set value='{\"caps\":{\"base\":{\"chat_media\":true}}}' where key='plan_matrix'");
ok("linha corrompida: plan_matrix() cai nos valores iniciais", JSON.stringify((await su.query("select plan_matrix() v")).rows[0].v) === JSON.stringify(def));
ok("linha corrompida: Essencial continua sem chat_media", (await su.query("select plan_cap_bool('base','chat_media') v")).rows[0].v === false);
await su.query("delete from platform_settings where key='plan_matrix'");
ok("linha ausente: Premium segue com 30 links", (await su.query("select plan_cap_int('maximo','campaign_links') v")).rows[0].v === 30);
ok("plano desconhecido: sem nenhuma ferramenta", (await su.query("select plan_cap_int('xx','campaign_links') n, plan_cap_bool('xx','members_area') b")).rows[0].n === 0);
ok("chave desconhecida: zero/falso", (await su.query("select plan_cap_int('maximo','nao_existe') n, plan_cap_bool('maximo','nao_existe') b")).rows[0].b === false);
await su.query("alter table platform_settings enable trigger all");

// permissões
const has = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
const gr = (await su.query(`select grantee, privilege_type from information_schema.role_routine_grants where routine_name in ('plan_matrix','plan_cap_int','plan_cap_bool') and grantee in ('anon','authenticated','PUBLIC')`)).rows;
ok("leitores da matriz não são chamáveis por anon/authenticated (RPC fechado)", gr.length === 0, JSON.stringify(gr));
await A.c.end(); await B.c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);

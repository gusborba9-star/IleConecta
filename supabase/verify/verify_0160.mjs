// Verificação LOCAL da 0160 (interruptor de emergência). Uso: node supabase/verify/verify_0160.mjs (bash /tmp/pgup.sh antes).
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const mig = readFileSync(new URL("../migrations/0160_interruptor_de_emergencia.sql", import.meta.url), "utf8");
const name = "vf0160";
const { c: su } = await freshDb(name, { with64: true, max: 159 });
const OWN = "a1600000-0000-0000-0000-000000000001", STAFF = "a1600000-0000-0000-0000-000000000002", USR = "a1600000-0000-0000-0000-000000000003";
for (const [id, t, n] of [[OWN, "cliente", "Dono"], [STAFF, "cliente", "Equipe"], [USR, "cliente", "Usuario"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [id, n + "@x.com"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type", [id, t, n]);
}
await su.query("insert into admins(user_id, is_owner, perms) values ($1,true,'{}'), ($2,false,array['suporte'])", [OWN, STAFF]);
await su.query("grant usage on schema public, auth to anon, authenticated; grant select, insert, update, delete on public.platform_settings to anon, authenticated;");
await su.query(mig); await su.query(mig);
ok("0160 aplica e reaplica sem erro", true);
const as = async (uid, sql, p) => { const c = await connect(name); try { await c.query("select set_config('test.uid',$1,false), set_config('test.role',$2,false)", [uid ?? "", uid ? "authenticated" : "anon"]); await c.query(uid ? "set role authenticated" : "set role anon"); return await c.query(sql, p); } finally { await c.end(); } };
const err = (pr) => pr.then(() => null, (x) => x.message);
const val = async () => (await su.query("select value from platform_settings where key='maintenance'")).rows[0].value;

const v0 = await val();
ok("valor inicial: tudo desligado", v0.assistant === false && v0.payments === false && v0.message === null);
ok("a leitura é pública (o app mostra o aviso sem login)", (await as(null, "select value from platform_settings where key='maintenance'")).rows.length === 1);

for (const [who, uid] of [["equipe com módulo (não dono)", STAFF], ["usuário comum", USR], ["sem login", null]])
  ok(`${who} NÃO liga o interruptor`, (await err(as(uid, "select public.admin_set_maintenance(true,true,null)"))) !== null);
ok("nada mudou após as tentativas recusadas", JSON.stringify(await val()) === JSON.stringify(v0));

ok("dono liga só pagamentos", (await err(as(OWN, "select public.admin_set_maintenance(false,true,'  Voltamos às 22h  ')"))) === null);
let v = await val();
ok("estado gravado: pagamentos ligados, mensagem aparada, início marcado", v.payments === true && v.assistant === false && v.message === "Voltamos às 22h" && /^\d{4}-\d\d-\d\dT/.test(v.since), JSON.stringify(v));
const since1 = v.since;
await as(OWN, "select public.admin_set_maintenance(true,true,null)");
v = await val();
ok("ligar a segunda chave mantém o início original e limpa a mensagem vazia", v.since === since1 && v.assistant === true && v.message === null, JSON.stringify(v));
await as(OWN, "select public.admin_set_maintenance(false,false,'texto antigo')");
v = await val();
ok("tudo desligado zera o início", v.assistant === false && v.payments === false && v.since === null, JSON.stringify(v));

for (const [lab, a, p, m] of [["mensagem longa demais", "false", "true", "x".repeat(201)], ["mensagem com <", "false", "true", "<b>oi</b>"]])
  ok(`recusa ${lab}`, /mensagem de manuten/i.test((await err(as(OWN, `select public.admin_set_maintenance(${a},${p},$1)`, [m]))) ?? ""));
ok("recusa estado nulo", (await err(as(OWN, "select public.admin_set_maintenance(null,true,null)"))) !== null);

const aud = (await su.query("select count(*)::int n from admin_audit where key='maintenance'")).rows[0].n;
ok("cada mudança entrou na auditoria (4 mudanças aceitas)", aud === 3, `n=${aud}`);
ok("a chave genérica admin_set_setting NÃO escreve 'maintenance' (só a função própria)", /invalid_key/.test((await err(as(OWN, "select public.admin_set_setting('maintenance', '{\"assistant\":true}'::jsonb)"))) ?? ""));
ok("escrita direta na tabela é recusada a quem está logado", (await err(as(OWN, "update platform_settings set value='{\"assistant\":true}'::jsonb where key='maintenance'"))) !== null || (await val()).assistant === false);
ok("anônimo não executa a função (ACL)", (await su.query("select has_function_privilege('anon','public.admin_set_maintenance(boolean,boolean,text)','execute') a")).rows[0].a === false);
await su.end(); console.log(bad ? `${bad} FALHA(S)` : "TUDO OK"); process.exit(bad ? 1 : 0);

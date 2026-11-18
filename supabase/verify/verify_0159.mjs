// Verificação LOCAL da 0159: Assumir/devolver só em conversa da casa com cliente. Uso: node supabase/verify/verify_0159.mjs (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const mig = readFileSync(new URL("../migrations/0159_assumir_so_em_conversa_com_cliente.sql", import.meta.url), "utf8");
const name = "vf0159";
const { c: su } = await freshDb(name, { with64: true, max: 115 });
const H1 = "a1590000-0000-0000-0000-000000000001", H2 = "a1590000-0000-0000-0000-000000000002", C = "a1590000-0000-0000-0000-0000000000c1";
for (const [id, t, n] of [[H1, "casa", "Casa Um"], [H2, "casa", "Casa Dois"], [C, "cliente", "Cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [id, n.replace(" ", "") + "@x.com"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type", [id, t, n]);
}
await su.query("insert into houses(owner_id,name,slug) values ($1,'Casa Um','casa-um'),($2,'Casa Dois','casa-dois')", [H1, H2]);
const mk = async (...u) => { const id = (await su.query("insert into conversations default values returning id")).rows[0].id; for (const x of u) await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2)", [id, x]); return id; };
const cHC = await mk(H1, C), cHH = await mk(H1, H2);
const as = async (uid, sql, p) => { const c = await connect(name); try { await c.query("select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)", [uid]); await c.query("set role authenticated"); return await c.query(sql, p); } finally { await c.end(); } };
const err = (pr) => pr.then(() => null, (x) => x.message);
await su.query("grant execute on function public.handoff_take(uuid), public.handoff_release(uuid) to authenticated").catch(() => {});
const antes = await err(as(H2, "select public.handoff_take($1)", [cHH]));
ok("ANTES da 0159 a outra casa conseguia assumir a conversa entre casas (reproduz)", antes === null, antes ?? "sem erro");
await su.query("delete from conversation_handoff");
await su.query(mig); await su.query(mig);
ok("0159 aplica e reaplica sem erro", true);
for (const u of [H1, H2]) ok("casa NÃO assume conversa entre duas casas", /indispon/i.test((await err(as(u, "select public.handoff_take($1)", [cHH]))) ?? ""));
ok("casa NÃO devolve conversa entre duas casas", /indispon/i.test((await err(as(H2, "select public.handoff_release($1)", [cHH]))) ?? ""));
ok("casa assume conversa com cliente", (await err(as(H1, "select public.handoff_take($1)", [cHC]))) === null);
ok("casa devolve conversa com cliente", (await err(as(H1, "select public.handoff_release($1)", [cHC]))) === null);
ok("cliente não assume", (await err(as(C, "select public.handoff_take($1)", [cHC]))) !== null);
ok("casa de fora não assume conversa alheia", (await err(as(H2, "select public.handoff_take($1)", [cHC]))) !== null);
ok("handoff_actor segue fechada a quem está logado", (await su.query("select has_function_privilege('authenticated','public.handoff_actor(uuid)','execute') a")).rows[0].a === false);
await su.end(); console.log(bad ? `${bad} FALHA(S)` : "TUDO OK"); process.exit(bad ? 1 : 0);

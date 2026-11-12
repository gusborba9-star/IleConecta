// Verificação LOCAL da migration 0083 (preços do Blueprint): troca só se a produção ainda tem os preços antigos, registra no histórico e é repetível.
// Uso: node supabase/verify/verify_0083.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
const SQL = readFileSync(new URL("../migrations/0083_precos_do_blueprint.sql", import.meta.url), "utf8");
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const { c, failed } = await freshDb("vf0083", { max: 82, with64: true });
ok("migrations 0001–0082 aplicadas", failed.length === 0, failed.join(" | "));
const price = async () => (await c.query("select value #>> '{plans,base,monthly}' b, value #>> '{plans,intermediario,monthly}' i, value #>> '{plans,maximo,monthly}' m, updated_by from public.platform_settings where key='pricing'")).rows[0];
const audits = async () => Number((await c.query("select count(*) n from public.admin_audit where key='pricing'")).rows[0].n);

const before = await price();
ok("ponto de partida com preços antigos", before.i === "139.9" && before.m === "199", JSON.stringify(before));

// sem administrador cadastrado: troca os preços, sem histórico (admin_id é obrigatório)
await c.query(SQL);
let p = await price();
ok("sem admin: Profissional 179,9 e Premium 299,9", p.i === "179.9" && p.m === "299.9", JSON.stringify(p));
ok("Essencial intacto (89,9)", p.b === "89.9");
ok("sem admin: nenhum registro de histórico", (await audits()) === 0);

// repetível
await c.query(SQL);
p = await price();
ok("repetir não muda nada", p.i === "179.9" && p.m === "299.9");

// não sobrescreve preço alterado pelo administrador
await c.query(`update public.platform_settings set value = jsonb_set(jsonb_set(value,'{plans,intermediario,monthly}','150'),'{plans,maximo,monthly}','250') where key='pricing'`);
await c.query(SQL);
p = await price();
ok("preço já editado (150/250) não é sobrescrito", p.i === "150" && p.m === "250", JSON.stringify(p));

// com administrador: troca e registra histórico com valor antigo e novo
const u = (await c.query("insert into auth.users(email) values ('adm@teste') returning id")).rows[0].id;
await c.query("insert into public.admins(user_id) values ($1)", [u]);
await c.query(`update public.platform_settings set value = jsonb_set(jsonb_set(value,'{plans,intermediario,monthly}','139.9'),'{plans,maximo,monthly}','199') where key='pricing'`);
await c.query(SQL);
p = await price();
ok("com admin: preços trocados e updated_by preenchido", p.i === "179.9" && p.m === "299.9" && p.updated_by === u);
const a = (await c.query("select old_value #>> '{plans,maximo,monthly}' o, new_value #>> '{plans,maximo,monthly}' n from public.admin_audit where key='pricing'")).rows;
ok("histórico registra antigo (199) e novo (299.9)", a.length === 1 && a[0].o === "199" && a[0].n === "299.9", JSON.stringify(a));

// outras chaves preservadas e linha ausente não quebra
const keep = (await c.query("select value -> 'boost_per_day' ->> 'cidade' b, value -> 'highlight_per_day' ->> 'pais' h from public.platform_settings where key='pricing'")).rows[0];
ok("destaque e impulsionamento preservados", keep.b === "19.9" && keep.h === "49.9", JSON.stringify(keep));
await c.query("delete from public.platform_settings where key='pricing'");
let err = null; try { await c.query(SQL); } catch (e) { err = e.message; }
ok("sem linha de preços: não falha e não cria", err === null && (await c.query("select 1 from public.platform_settings where key='pricing'")).rowCount === 0, err);
await c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);

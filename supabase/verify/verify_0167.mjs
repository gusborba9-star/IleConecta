// Verificação LOCAL da migration 0167 (categorias, licença e créditos das músicas). Uso: node supabase/verify/verify_0167.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0167";
const { c: su, failed } = await freshDb(name, { with64: true, max: 166 });
ok("migrations 0001–0166 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0167_musica_categorias_e_creditos.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0167000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name", [id, nm, type]); };
const BOSS = uuid(1), MOD = uuid(2), CLI = uuid(4);
await mk(BOSS, "Dono Plataforma"); await mk(MOD, "Moderadora"); await mk(CLI, "Cliente");
await su.query("insert into admins(user_id, is_owner) values ($1, true)", [BOSS]);
await su.query("insert into admins(user_id, perms) values ($1, array['moderacao'])", [MOD]);
await su.query("insert into storage.objects(bucket_id,name,owner) values ('music','aaaaaaaa1111.mp3',$1),('music','bbbbbbbb2222.mp3',$1)", [BOSS]);
const T1 = (await sv("insert into music_tracks(title,author,path,size_bytes) values ('Brisa','Ana','aaaaaaaa1111.mp3',1000) returning id")).rows[0].id;
const T2 = (await sv("insert into music_tracks(title,author,path,size_bytes,active) values ('Fora','Beto','bbbbbbbb2222.mp3',1000,false) returning id")).rows[0].id;

let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0167 aplica e reaplica sem erro", e === null, e ?? "");
ok("faixas antigas ficam sem estilo, sem ocasião e sem voz", (await sv("select style, occasions, vocal from music_tracks where id=$1", [T1])).rows.every((r) => r.style === null && r.occasions.length === 0 && r.vocal === false));

const meta = (uid, id, st, oc, v, k, u) => as(uid, (c) => q(c, "select admin_music_meta($1,$2,$3,$4,$5,$6)", [id, st, oc, v, k, u]));
for (const [who, uid] of [["cliente", CLI], ["equipe sem 'dono'", MOD], ["anônimo", null]]) {
  const r = await meta(uid, T1, "pop", ["festa"], true, "cc0", null); ok(`${who} NÃO altera categorias`, !!r.err && /not_admin|permission/.test(r.err), r.err);
}
const g = await meta(BOSS, T1, "pop", ["festa", "aniversario", "festa"], true, "cc_by", "https://creativecommons.org/licenses/by/4.0/");
ok("dono grava estilo, ocasiões (sem repetir), voz e licença", !g.err, g.err);
const r1 = (await sv("select style, occasions, vocal, license_kind, license_url from music_tracks where id=$1", [T1])).rows[0];
ok("valores gravados corretamente", r1.style === "pop" && r1.occasions.join() === "aniversario,festa" && r1.vocal === true && r1.license_kind === "cc_by" && r1.license_url.startsWith("https://"), JSON.stringify(r1));
ok("mais de 5 ocasiões é recusado", (await meta(BOSS, T1, "pop", ["aa", "bb", "cc", "dd", "ee", "ff"], false, null, null)).err?.includes("no máximo 5"));
ok("ocasião com letra maiúscula, espaço ou injeção é recusada", !!(await meta(BOSS, T1, "pop", ["Festa"], false, null, null)).err && !!(await meta(BOSS, T1, "pop", ["x'; drop table music_tracks;--"], false, null, null)).err);
ok("estilo inválido é recusado", !!(await meta(BOSS, T1, "Pop Rock!", [], false, null, null)).err);
ok("tipo de licença desconhecido é recusado", !!(await meta(BOSS, T1, "pop", [], false, "livre", null)).err);
ok("link de licença que não é https é recusado", !!(await meta(BOSS, T1, "pop", [], false, "cc0", "javascript:alert(1)")).err && !!(await meta(BOSS, T1, "pop", [], false, "cc0", "http://x.com/l")).err);
ok("faixa inexistente é recusada", !!(await meta(BOSS, "00000000-0000-0000-0000-000000000009", "pop", [], false, null, null)).err);
ok("limpar tudo (nulos) é aceito", !(await meta(BOSS, T2, null, null, null, null, "  ")).err);

// ---- catálogo e créditos: só com a música ligada, só faixas ligadas
ok("música desligada: catálogo e créditos vazios", (await as(CLI, (c) => q(c, "select music_catalog() a, music_credits() b"))).rows.every((r) => r.a.length === 0 && r.b.length === 0));
await su.query("update music_settings set enabled = true");
const cat = (await as(CLI, (c) => q(c, "select music_catalog() a, music_credits() b"))).rows[0];
ok("catálogo traz estilo, ocasiões e voz só da faixa ligada", cat.a.length === 1 && cat.a[0].style === "pop" && cat.a[0].vocal === true && cat.a[0].occasions.length === 2);
ok("catálogo NÃO expõe licença, fonte nem tamanho", !("license_url" in cat.a[0]) && !("source_url" in cat.a[0]) && !("size_bytes" in cat.a[0]));
ok("créditos trazem título, autor, fonte e licença da faixa ligada", cat.b.length === 1 && cat.b[0].title === "Brisa" && cat.b[0].license_kind === "cc_by" && cat.b[0].license_url.startsWith("https://"));
ok("créditos NÃO expõem o nome do arquivo nem quem cadastrou", !("path" in cat.b[0]) && !("created_by" in cat.b[0]));
ok("anônimo não lê catálogo nem créditos", (await as(null, (c) => q(c, "select music_catalog() a, music_credits() b"))).rows.every((r) => r.a.length === 0 && r.b.length === 0));
ok("painel lista os campos novos", (await as(BOSS, (c) => q(c, "select admin_music_list() d"))).rows[0].d.tracks.some((t) => t.style === "pop" && t.license_kind === "cc_by"));
console.log(`\n${total - bad}/${total} OK`); await su.end(); process.exit(bad ? 1 : 0);

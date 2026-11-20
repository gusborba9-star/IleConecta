// Verificação LOCAL da migration 0169 (registro de 5 anos das faixas retiradas). Uso: node supabase/verify/verify_0169.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0169";
const { c: su, failed } = await freshDb(name, { with64: true, max: 168 });
ok("migrations 0001–0168 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0169_registro_de_faixas_retiradas.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0169000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name", [id, nm, type]); };
const BOSS = uuid(1), MOD = uuid(2), CLI = uuid(4);
await mk(BOSS, "Dono Plataforma"); await mk(MOD, "Moderadora"); await mk(CLI, "Cliente");
await su.query("insert into admins(user_id, is_owner) values ($1, true)", [BOSS]);
await su.query("insert into admins(user_id, perms) values ($1, array['moderacao'])", [MOD]);
const track = async (title, path, extra = "") => (await sv(`insert into music_tracks(title,author,path,size_bytes,source_url,license_kind,license_url,license_note,license_date,style ${extra ? "," + extra.split("=")[0] : ""}) values ($1,'Ana',$2,1000,'https://fonte.example/x','cc_by','https://creativecommons.org/licenses/by/4.0/','nota','2026-11-10','pop' ${extra ? ",'" + extra.split("=")[1] + "'" : ""}) returning id`, [title, path])).rows[0].id;

let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0169 aplica e reaplica sem erro", e === null, e ?? "");
const T1 = await track("Brisa", "aaaaaaaa1111.mp3"), T2 = await track("Mar", "bbbbbbbb2222.mp3"), T3 = await track("Sol", "cccccccc3333.mp3"), T4 = await track("Lua", "dddddddd4444.mp3");

// ---- referência do print
const proof = (uid, id, p) => as(uid, (c) => q(c, "select admin_music_proof($1,$2)", [id, p]));
for (const [who, uid] of [["cliente", CLI], ["equipe sem 'dono'", MOD]]) ok(`${who} NÃO grava a referência do print`, !!(await proof(uid, T1, "x")).err);
ok("anônimo NÃO grava a referência do print", !!(await as(null, (c) => q(c, "select admin_music_proof($1,$2)", [T1, "x"]), "anon")).err);
ok("dono grava a referência (espaços ajustados)", !(await proof(BOSS, T1, "  Drive  /Licenças/brisa.png ")).err && (await sv("select license_proof p from music_tracks where id=$1", [T1])).rows[0].p === "Drive /Licenças/brisa.png");
ok("referência com HTML ou acima de 200 caracteres é recusada", !!(await proof(BOSS, T1, "<img src=x>")).err && !!(await proof(BOSS, T1, "a".repeat(201))).err);
ok("referência de faixa inexistente é recusada", !!(await proof(BOSS, "00000000-0000-0000-0000-000000000009", "x")).err);
ok("limpar a referência (vazia) é aceito", !(await proof(BOSS, T2, "   ")).err && (await sv("select license_proof p from music_tracks where id=$1", [T2])).rows[0].p === null);
ok("lista do painel devolve a referência", (await as(BOSS, (c) => q(c, "select admin_music_list() d"))).rows[0].d.tracks.some((t) => t.license_proof === "Drive /Licenças/brisa.png"));

// ---- apagar grava o registro
const del = (uid, id, r) => as(uid, (c) => q(c, r === undefined ? "select admin_music_delete($1) p" : "select admin_music_delete($1,$2) p", r === undefined ? [id] : [id, r]));
for (const [who, uid] of [["cliente", CLI], ["equipe sem 'dono'", MOD]]) { const r = await del(uid, T1, "teste"); ok(`${who} NÃO apaga faixa`, !!r.err && /not_admin|permission/.test(r.err), r.err); }
ok("anônimo NÃO apaga faixa", !!(await as(null, (c) => q(c, "select admin_music_delete($1,$2)", [T1, "x"]), "anon")).err);
ok("nenhum registro nasceu das tentativas recusadas", (await sv("select count(*)::int n from music_license_log")).rows[0].n === 0 && (await sv("select count(*)::int n from music_tracks")).rows[0].n === 4);
ok("motivo curto demais ou longo demais é recusado", !!(await del(BOSS, T1, "ab")).err && !!(await del(BOSS, T1, "x".repeat(301))).err);
const d1 = await del(BOSS, T1, " Encerrei   a biblioteca de teste ");
ok("dono apaga e recebe o caminho do arquivo (para limpar o armazenamento)", !d1.err && d1.rows[0].p === "aaaaaaaa1111.mp3", d1.err);
const L1 = (await sv("select * from music_license_log")).rows[0];
ok("registro guarda título, autor, fonte, licença, datas e print", L1.title === "Brisa" && L1.author === "Ana" && L1.source_url === "https://fonte.example/x" && L1.license_kind === "cc_by" && L1.license_url.startsWith("https://creativecommons") && L1.license_note === "nota" && String(L1.license_date.toISOString?.() ?? L1.license_date).includes("2026-11-10") && L1.license_proof === "Drive /Licenças/brisa.png" && L1.style === "pop", JSON.stringify(L1));
ok("registro guarda quem retirou e o motivo (ajustado)", L1.removed_by === BOSS && L1.removal_reason === "Encerrei a biblioteca de teste");
ok("registro guarda até 5 anos depois da retirada", (await sv("select abs(extract(epoch from (keep_until - (removed_at + interval '5 years')))) < 60 ok from music_license_log")).rows[0].ok);
ok("a faixa saiu da biblioteca", (await sv("select count(*)::int n from music_tracks where id=$1", [T1])).rows[0].n === 0);
ok("chamada antiga (sem motivo) ainda funciona e registra o motivo padrão", !(await del(BOSS, T2)).err && (await sv("select removal_reason r from music_license_log order by id desc limit 1")).rows[0].r === "Removida pela administração");
ok("apagar faixa inexistente é recusado e não cria registro", !!(await del(BOSS, T2, "de novo")).err && (await sv("select count(*)::int n from music_license_log")).rows[0].n === 2);
ok("registro não guarda dado de usuário (sem id de faixa nem do arquivo)", !(await sv("select column_name from information_schema.columns where table_name='music_license_log'")).rows.some((r) => ["path", "track_id", "created_by"].includes(r.column_name)));

// ---- consulta e fechamento
ok("tabela do registro fechada para anônimo, logado e dono (só por função)", !!(await as(null, (c) => q(c, "select * from music_license_log"), "anon")).err && !!(await as(CLI, (c) => q(c, "select * from music_license_log"))).err && !!(await as(BOSS, (c) => q(c, "select * from music_license_log"))).err);
ok("tabela do registro não aceita escrita direta", !!(await as(BOSS, (c) => q(c, "delete from music_license_log"))).err);
for (const [who, uid] of [["cliente", CLI], ["equipe sem 'dono'", MOD]]) ok(`${who} NÃO lê o registro`, !!(await as(uid, (c) => q(c, "select admin_music_log()"))).err);
ok("anônimo NÃO lê o registro", !!(await as(null, (c) => q(c, "select admin_music_log()"), "anon")).err);
const lg = (await as(BOSS, (c) => q(c, "select admin_music_log() d"))).rows[0].d;
ok("dono lê o registro, a mais nova primeiro, com o nome de quem retirou", lg.length === 2 && lg[0].title === "Mar" && lg[1].title === "Brisa" && lg[1].by === "Dono Plataforma" && lg[1].license_proof === "Drive /Licenças/brisa.png");

// ---- limpeza de 5 anos (o mesmo comando do agendamento)
await su.query("update music_license_log set keep_until = now() - interval '1 day' where title = 'Brisa'");
await su.query("delete from public.music_license_log where keep_until < now()");
ok("a limpeza apaga só o que passou de 5 anos", (await sv("select array_agg(title) t from music_license_log")).rows[0].t.join() === "Mar");
console.log(`\n${total - bad}/${total} OK`); await su.end(); process.exit(bad ? 1 : 0);

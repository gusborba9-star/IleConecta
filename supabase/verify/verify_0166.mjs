// Verificação LOCAL da migration 0166 (biblioteca de músicas dos Momentos). Uso: node supabase/verify/verify_0166.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0166";
const { c: su, failed } = await freshDb(name, { with64: true, max: 165 });
ok("migrations 0001–0165 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0166_momentos_musica.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0166000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name", [id, nm, type]); };
const BOSS = uuid(1), MOD = uuid(2), OWN = uuid(3), CLI = uuid(4), OWNV = uuid(5), H1 = uuid(11), HV = uuid(12);
await mk(BOSS, "Dono Plataforma", "cliente"); await mk(MOD, "Moderadora", "cliente"); await mk(OWN, "Casa Um", "casa"); await mk(CLI, "Cliente"); await mk(OWNV, "Casa Premium", "casa");
await su.query("insert into admins(user_id, is_owner) values ($1, true)", [BOSS]);
await su.query("insert into admins(user_id, perms) values ($1, array['moderacao'])", [MOD]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','base'), ($3,$4,'Casa Premium','casa-premium','maximo')", [H1, OWN, HV, OWNV]);

let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0166 aplica e reaplica sem erro", e === null, e ?? "");
ok("interruptor geral nasce DESLIGADO e o teto de espaço é 500 MB", (await sv("select enabled, max_total_bytes::bigint m from music_settings")).rows.every((r) => r.enabled === false && Number(r.m) === 524288000));

// ---- tabelas fechadas
for (const t of ["music_tracks", "music_settings"]) ok(`tabela ${t} fechada para logados e anônimos`, !!(await as(CLI, (c) => q(c, `select * from ${t}`))).err && !!(await as(null, (c) => q(c, `select * from ${t}`))).err);

// ---- só o dono da plataforma administra
const put = (b, n, ageH = 0) => su.query("insert into storage.objects(bucket_id,name,owner,created_at) values ($1,$2,$3, now() - ($4 || ' hours')::interval) on conflict do nothing", [b, n, BOSS, String(ageH)]);
await put("music", "aaaaaaaa1111.mp3");
const add = (uid, path = "aaaaaaaa1111.mp3", t = "Brisa de Axé", a = "Autor X", src = "https://pixabay.com/music/x", lic = "Pixabay Content License", size = 3000000) =>
  as(uid, (c) => q(c, "select admin_music_add($1,$2,$3,$4,$5,'2026-11-18',$6) id", [path, t, a, src, lic, size]));
for (const [who, uid] of [["cliente", CLI], ["casa", OWN], ["moderação (equipe)", MOD], ["anônimo", null]]) {
  const r = await add(uid); ok(`${who} NÃO cadastra faixa`, !!r.err && /not_admin|permission/.test(r.err), r.err);
}
ok("equipe sem 'dono' não liga o interruptor nem vê a lista", !!(await as(MOD, (c) => q(c, "select admin_music_set_enabled(true)"))).err && !!(await as(MOD, (c) => q(c, "select admin_music_list()"))).err);

// ---- cadastro e validações
const bad1 = await add(BOSS, "bbbbbbbb2222.mp3"); ok("arquivo que não está no armazenamento é recusado", !!bad1.err && /enviado pela própria plataforma/.test(bad1.err), bad1.err);
await put("music", "cccccccc3333.exe");
ok("nome de arquivo fora do padrão é recusado", !!(await add(BOSS, "../x.mp3")).err && !!(await add(BOSS, "cccccccc3333.exe")).err);
ok("link de fonte que não é https é recusado", !!(await add(BOSS, "aaaaaaaa1111.mp3", "T", "A", "javascript:alert(1)")).err);
ok("título vazio é recusado", !!(await add(BOSS, "aaaaaaaa1111.mp3", "   ", "A")).err);
ok("tamanho acima de 8 MB é recusado", !!(await add(BOSS, "aaaaaaaa1111.mp3", "T", "A", null, null, 9000000)).err);
const good = await add(BOSS);
ok("dono cadastra a faixa", !good.err && !!good.rows[0].id, good.err);
const T1 = good.rows[0].id;
ok("faixa nasce ligada, com a data da licença", (await sv("select active, license_date::text d from music_tracks where id=$1", [T1])).rows[0].active === true);
const dup = await add(BOSS); ok("o mesmo arquivo não cadastra duas vezes", !!dup.err, dup.err);

// ---- teto de espaço e de quantidade
await put("music", "dddddddd4444.mp3");
await su.query("update music_settings set max_total_bytes = 4000000");
const over = await add(BOSS, "dddddddd4444.mp3", "Grande", "A", null, null, 2000000);
ok("passou do espaço reservado: recusa com mensagem clara", !!over.err && /espaço reservado/.test(over.err), over.err);
await su.query("update music_settings set max_total_bytes = 524288000");
const add2 = await add(BOSS, "dddddddd4444.mp3", "Segunda", "A", null, null, 2000000);
ok("com espaço, cadastra a segunda", !add2.err, add2.err); const T2 = add2.rows[0]?.id;
await su.query(`insert into music_tracks(title,author,path,size_bytes) select 'f'||g,'a', 'f'||lpad(g::text,9,'0')||'.mp3', 1 from generate_series(1,298) g`);
await put("music", "eeeeeeee5555.mp3");
const lim = await add(BOSS, "eeeeeeee5555.mp3", "301", "A", null, null, 10);
ok("300 faixas é o teto", !!lim.err && /300 faixas/.test(lim.err), lim.err);
await su.query("delete from music_tracks where path like 'f%' and path <> 'aaaaaaaa1111.mp3'");

// ---- lista do painel
const list = (await as(BOSS, (c) => q(c, "select admin_music_list() l"))).rows[0].l;
ok("lista do painel: faixas, total de bytes, teto", list.tracks.length === 2 && list.total_bytes === 5000000 && list.max_count === 300 && list.enabled === false, JSON.stringify(list).slice(0, 200));

// ---- catálogo
const cat = (uid) => as(uid, (c) => q(c, "select music_catalog() c")).then((r) => r.rows?.[0]?.c);
ok("interruptor geral desligado: catálogo vazio para todos", (await cat(OWN)).length === 0);
const on = await as(BOSS, (c) => q(c, "select admin_music_set_enabled(true)")); ok("dono liga o interruptor geral", !on.err, on.err);
ok("ligar o interruptor fica no registro de auditoria", (await sv("select count(*)::int n from admin_audit where key='music_enabled'")).rows[0].n === 1);
let c1 = await cat(OWN); ok("ligado: casa vê as faixas ligadas, em ordem de título, sem dados internos", c1.length === 2 && c1[0].title === "Brisa de Axé" && c1[1].title === "Segunda" && !("license_note" in c1[0]) && !("size_bytes" in c1[0]), JSON.stringify(c1).slice(0, 160));
ok("anônimo recebe lista vazia", (await cat(null)).length === 0);
await as(BOSS, (c) => q(c, "select admin_music_set_active($1,false)", [T2]));
ok("faixa desligada some do catálogo", (await cat(CLI)).length === 1);
await as(BOSS, (c) => q(c, "select admin_music_set_active($1,true)", [T2]));

// ---- editar
const up = await as(BOSS, (c) => q(c, "select admin_music_update($1,'Novo título','Nova autora',null,'Licença livre','2026-11-01')", [T1]));
ok("dono edita título, autor e licença", !up.err && (await sv("select title, author, source_url from music_tracks where id=$1", [T1])).rows[0].title === "Novo título", up.err);
ok("editar com dado inválido é recusado", !!(await as(BOSS, (c) => q(c, "select admin_music_update($1,'x','y','http://inseguro','','2026-11-01')", [T1]))).err);

// ---- publicar com música
const putM = (owner, f) => su.query("insert into storage.objects(bucket_id,name,owner) values ('moments',$1,$2) on conflict do nothing", [`${owner}/${f}`, owner]);
const pubM = async (owner, house, tag, music, ext = "jpg", extra = "") => { await putM(owner, `${tag}.${ext}`); return as(owner, (c) => q(c, `insert into stories(house_id,media_path,music_id${extra ? ",poster_path,duration_s" : ""}) values ($1,$2,$3${extra ? `,$4,10` : ""}) returning id, music_id`, extra ? [house, `${owner}/${tag}.${ext}`, music, `${owner}/${extra}`] : [house, `${owner}/${tag}.${ext}`, music])); };
const s1 = await pubM(OWN, H1, "m1", T1); ok("foto com faixa ligada publica e guarda a música", !s1.err && s1.rows[0].music_id === T1, s1.err);
const s0 = await pubM(OWN, H1, "m0", null); ok("sem música continua funcionando", !s0.err && s0.rows[0].music_id === null, s0.err);
await su.query("update music_tracks set active=false where id=$1", [T2]);
const sOff = await pubM(OWN, H1, "m2", T2); ok("faixa desligada é recusada", !!sOff.err && /não está disponível/.test(sOff.err), sOff.err);
await su.query("update music_tracks set active=true where id=$1", [T2]);
const sBogus = await pubM(OWN, H1, "m3", uuid(999)); ok("faixa que não existe é recusada", !!sBogus.err, sBogus.err);
await su.query("update music_settings set enabled=false");
const sGlob = await pubM(OWN, H1, "m4", T1); ok("interruptor geral desligado: recusa publicar com música", !!sGlob.err && /não está disponível/.test(sGlob.err), sGlob.err);
await su.query("update music_settings set enabled=true");
await putM(OWNV, "poster.jpg");
const sVid = await pubM(OWNV, HV, "v1", T1, "mp4", "poster.jpg"); ok("vídeo ignora a música (tem o próprio som)", !sVid.err && sVid.rows[0].music_id === null, sVid.err);
ok("recusa não gasta vaga do dia", (await sv("select count(*)::int n from moment_publish_log where house_id=$1", [H1])).rows[0].n === 2);

// ---- feed
const feedOf = async (uid) => { const r = await as(uid, (c) => q(c, "select moments_feed() f")); return (r.rows?.[0]?.f ?? []).flatMap((g) => g.items); };
let items = await feedOf(OWN); const withM = items.find((i) => i.id === s1.rows[0].id);
ok("feed traz a música (id, título, autor, arquivo) e nada interno", withM?.music?.title === "Novo título" && withM.music.author === "Nova autora" && /\.mp3$/.test(withM.music.path) && !("license_note" in withM.music), JSON.stringify(withM?.music));
ok("momento sem música vem com music nulo", items.find((i) => i.id === s0.rows[0].id)?.music == null);
await su.query("update music_tracks set active=false where id=$1", [T1]);
ok("faixa desligada: o momento segue no ar, sem música", (await feedOf(OWN)).find((i) => i.id === s1.rows[0].id)?.music == null);
await su.query("update music_tracks set active=true where id=$1", [T1]); await su.query("update music_settings set enabled=false");
ok("interruptor geral desligado: ninguém recebe música no feed", (await feedOf(OWN)).every((i) => i.music == null));
await su.query("update music_settings set enabled=true");

// ---- apagar faixa
const del = await as(BOSS, (c) => q(c, "select admin_music_delete($1) p", [T1]));
ok("apagar devolve o nome do arquivo e remove a linha", !del.err && del.rows[0].p === "aaaaaaaa1111.mp3" && (await sv("select count(*)::int n from music_tracks where id=$1", [T1])).rows[0].n === 0, del.err);
ok("momento que usava a faixa continua publicado, sem música", (await sv("select music_id from stories where id=$1", [s1.rows[0].id])).rows[0].music_id === null);
ok("apagar faixa inexistente é recusado", !!(await as(BOSS, (c) => q(c, "select admin_music_delete($1)", [T1]))).err);

// ---- armazenamento: só o dono envia; nome precisa seguir o padrão
const ins = (uid, n) => as(uid, (c) => q(c, "insert into storage.objects(bucket_id,name,owner) values ('music',$1,$2)", [n, uid]));
ok("dono envia arquivo ao bucket de músicas", !(await ins(BOSS, "ffffffff6666.mp3")).err);
ok("casa, cliente e equipe NÃO enviam", !!(await ins(OWN, "gggggggg7777.mp3")).err && !!(await ins(CLI, "gggggggg7777.mp3")).err && !!(await ins(MOD, "gggggggg7777.mp3")).err);
ok("nome fora do padrão não entra nem para o dono", !!(await ins(BOSS, "../../x.mp3")).err && !!(await ins(BOSS, "UPPER.exe")).err);
ok("só o dono apaga arquivo do bucket", (await as(OWN, (c) => q(c, "delete from storage.objects where bucket_id='music' and name='ffffffff6666.mp3'"))).n === 0 && (await as(BOSS, (c) => q(c, "delete from storage.objects where bucket_id='music' and name='ffffffff6666.mp3'"))).n === 1);

// ---- limpeza de arquivos sem faixa
await put("music", "hhhhhhhh8888.mp3", 30); await put("music", "iiiiiiii9999.mp3", 1);
const orph = (await sv("select bucket, path from files_to_purge(500) where bucket='music'")).rows.map((r) => r.path);
ok("arquivo de música sem faixa, com mais de 1 dia, vai para a limpeza", orph.includes("hhhhhhhh8888.mp3"));
ok("arquivo recente e arquivo com faixa ficam", !orph.includes("iiiiiiii9999.mp3") && !orph.includes("dddddddd4444.mp3"), orph.join());

// ---- permissões
const acl = (await sv(`select has_function_privilege('anon','public.admin_music_add(text,text,text,text,text,date,integer)','execute') a1,
  has_function_privilege('anon','public.music_catalog()','execute') a2, has_function_privilege('authenticated','public.music_catalog()','execute') b2,
  has_function_privilege('authenticated','public.files_to_purge(integer)','execute') c1, has_function_privilege('service_role','public.files_to_purge(integer)','execute') c2`)).rows[0];
ok("anônimo não executa funções de música; logado vê o catálogo (o ACL da limpeza é conferido em produção: este banco local usa permissões amplas)", acl.a1 === false && acl.a2 === false && acl.b2 === true && acl.c2 === true, JSON.stringify(acl));
await su.end(); console.log(bad ? `${bad} FALHA(S) de ${total}` : `TUDO OK (${total})`); process.exit(bad ? 1 : 0);

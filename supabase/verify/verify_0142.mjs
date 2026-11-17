// Verificação LOCAL da migration 0142 (letras com a sua identidade). Uso: node supabase/verify/verify_0142.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0142";
const { c: su, failed } = await freshDb(name, { with64: true, max: 141 });
ok("migrations 0001–0141 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; grant select on storage.objects to anon; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0142_letras_com_a_sua_identidade.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0142000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'casa',$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm]); };
const FREE = [uuid(1), uuid(11)], PRO = [uuid(3), uuid(13)];
await mk(FREE[0], "Casa grátis"); await mk(PRO[0], "Casa pro");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa grátis','casa-gratis','gratis'),($3,$4,'Casa pro','casa-pro','intermediario')", [FREE[1], FREE[0], PRO[1], PRO[0]]);

// ---- matriz: texto do benefício
const OLD = "Posts com a cara da sua casa: a foto do seu templo ou altar vira o fundo da publicação, com o texto sempre legível";
const benefits = async () => (await sv("select value->'copy'->'intermediario'->'benefits' b from platform_settings where key='plan_matrix'")).rows[0].b;
ok("antes da 0142 o texto antigo está na matriz", (await benefits()).some((x) => x.text === OLD));
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0142 aplica e reaplica sem erro", e === null, e ?? "");
let b = await benefits();
ok("benefício do Profissional agora fala das letras (uma vez só)", b.filter((x) => /letras na sua identidade/.test(x.text)).length === 1 && !b.some((x) => x.text === OLD));
ok("matriz salva = padrão do banco quando ninguém editou", (await sv("select value = plan_matrix_default() ok from platform_settings where key='plan_matrix'")).rows[0].ok === true);
ok("padrão novo é válido (plan_matrix_ok)", (await sv("select plan_matrix_ok(plan_matrix_default()) o")).rows[0].o === true);
// edição do proprietário no texto vale mais que a migration
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");
const edited = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
const ed = JSON.parse(JSON.stringify(edited)); ed.copy.intermediario.benefits = ed.copy.intermediario.benefits.map((x) => (/letras na sua identidade/.test(x.text) ? { ...x, text: OLD } : x)); ed.copy.intermediario.benefits[0].text = "Texto editado pelo dono.";
await su.query("update platform_settings set value=$1 where key='plan_matrix'", [ed]); await su.query(mig);
b = await benefits();
ok("texto que o dono editou é preservado (a migration só troca o texto antigo intacto, sem apagar a edição)", b[0].text === "Texto editado pelo dono." && b.filter((x) => x.text.includes("letras na sua identidade")).length === 1);
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");

// ---- posts
const putObj = async (owner, file) => su.query("insert into storage.objects(bucket_id,name,owner) values ('post-images',$1,$2) on conflict do nothing", [`${owner}/${file}`, owner]).catch(() => su.query("insert into storage.objects(bucket_id,name) values ('post-images',$1)", [`${owner}/${file}`]));
await putObj(PRO[0], "foto.jpg"); await putObj(FREE[0], "foto.jpg");
const ins = (uid, h, o = {}) => as(uid, (c) => q(c, "insert into posts(house_id,kind,content,card_style,card_image_path,card_rights_ack,card_font,card_size,card_color,card_align,card_pos,card_bold,card_italic) values ($1,'geral',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id", [h, o.content ?? "Axé a todos!", o.style ?? null, o.path ?? null, o.ack ?? false, o.font ?? null, o.size ?? null, o.color ?? null, o.align ?? null, o.pos ?? null, o.bold ?? false, o.italic ?? false]));
const base = { style: "total", path: `${PRO[0]}/foto.jpg`, ack: true };
const good = [
  ["total completo", { ...base, font: "ritual", size: "g", color: "dourado", align: "centro", pos: "meio", bold: true, italic: true }],
  ["total só fonte", { ...base, font: "manuscrita" }],
  ["parcial com cor escura", { ...base, style: "parcial", font: "elegante", size: "p", color: "vinho", align: "dir", bold: true }],
  ["total sem nenhuma letra (como na 0140)", base],
];
for (const [n, o] of good) { const r = await ins(PRO[0], PRO[1], o); ok(`aceita: ${n}`, !r.err, r.err); }
const saved = (await sv("select card_font,card_size,card_color,card_align,card_pos,card_bold,card_italic from posts where card_font='ritual'")).rows[0];
ok("o que foi escolhido é o que ficou gravado", JSON.stringify(saved) === JSON.stringify({ card_font: "ritual", card_size: "g", card_color: "dourado", card_align: "centro", card_pos: "meio", card_bold: true, card_italic: true }));
ok("post sem letras fica com tudo nulo e negrito/itálico falsos", (await sv("select count(*)::int n from posts where card_font is null and card_size is null and card_color is null and card_align is null and card_pos is null and not card_bold and not card_italic")).rows[0].n === 1);
const refuse = [
  ["fonte fora da lista", { ...base, font: "comic" }, /posts_card_letters_ok/],
  ["fonte tentando injetar CSS", { ...base, font: "x;background:url(http://a)" }, /posts_card_letters_ok/],
  ["tamanho fora da lista", { ...base, size: "enorme" }, /posts_card_letters_ok/],
  ["cor em hexadecimal livre (card todo)", { ...base, color: "#ff0000" }, /posts_card_letters_ok|cor clara/],
  ["cor em hexadecimal livre (card parcial)", { ...base, style: "parcial", color: "#000000" }, /posts_card_letters_ok|cor escura/],
  ["alinhamento fora da lista", { ...base, align: "justificado" }, /posts_card_letters_ok/],
  ["posição fora da lista", { ...base, pos: "fundo" }, /posts_card_letters_ok/],
  ["cor escura sobre a foto (card todo)", { ...base, color: "preto" }, /cor clara/],
  ["cor clara sobre o papel (card parcial)", { ...base, style: "parcial", color: "dourado" }, /cor escura/],
  ["posição do texto no card parcial", { ...base, style: "parcial", pos: "topo" }, /card todo/],
  ["letras sem estilo de card", { style: null, font: "ritual" }, /só no post com imagem/],
  ["negrito sem estilo de card", { style: null, bold: true }, /só no post com imagem/],
];
for (const [n, o, re] of refuse) { const r = await ins(PRO[0], PRO[1], o); ok(`recusa: ${n}`, re.test(r.err ?? ""), r.err); }
const rf = await ins(FREE[0], FREE[1], { style: "total", path: `${FREE[0]}/foto.jpg`, ack: true, font: "ritual" });
ok("plano sem a ferramenta: letras recusadas (trava de plano da 0140 continua valendo)", /Profissional/.test(rf.err ?? ""), rf.err);
// regras da 0140 continuam
const r0 = await ins(PRO[0], PRO[1], { ...base, ack: false, font: "ritual" }); ok("continua exigindo a confirmação de direito de uso", /direito de usar/.test(r0.err ?? ""), r0.err);
const r1 = await ins(PRO[0], PRO[1], { ...base, content: "a".repeat(401), font: "ritual" }); ok("continua limitando o texto do card a 400", /até 400/.test(r1.err ?? ""), r1.err);

// ---- atualização: o gatilho enxerga as colunas novas
const pid = (await sv("select id from posts where card_style='parcial' limit 1")).rows[0].id;
const upd = (uid, sql, p) => as(uid, (c) => q(c, sql, p));
let u = await upd(PRO[0], "update posts set card_color='dourado' where id=$1", [pid]);
ok("UPDATE só da cor também passa pela guarda (cor clara no card parcial é recusada)", /cor escura/.test(u.err ?? ""), u.err);
u = await upd(PRO[0], "update posts set card_pos='topo' where id=$1", [pid]);
ok("UPDATE só da posição no card parcial é recusado", /card todo/.test(u.err ?? ""), u.err);
u = await upd(PRO[0], "update posts set card_color='marrom' where id=$1", [pid]);
ok("UPDATE válido (outra cor escura) funciona", !u.err && u.n === 1, u.err);
// casa que perdeu o plano não mexe nas letras de um post antigo; o post antigo continua como está
await su.query("update houses set plan='gratis' where id=$1", [PRO[1]]);
u = await upd(PRO[0], "update posts set card_font='ritual' where id=$1", [pid]);
ok("casa rebaixada não consegue mudar as letras de post antigo", /Profissional/.test(u.err ?? ""), u.err);
ok("…e o post antigo continua guardado como estava", (await sv("select card_color c from posts where id=$1", [pid])).rows[0].c === "marrom");
await su.query("update houses set plan='intermediario' where id=$1", [PRO[1]]);
// tirar o estilo com letras ainda marcadas é recusado; tirar tudo junto é aceito
u = await upd(PRO[0], "update posts set card_style=null, card_image_path=null where id=$1", [pid]);
ok("remover o estilo deixando letras é recusado", /só no post com imagem/.test(u.err ?? ""), u.err);
u = await upd(PRO[0], "update posts set card_style=null, card_image_path=null, card_font=null, card_size=null, card_color=null, card_align=null, card_pos=null, card_bold=false, card_italic=false where id=$1", [pid]);
ok("remover estilo e letras juntos funciona", !u.err && u.n === 1, u.err);
// outra casa não altera as letras deste post
const other = await upd(FREE[0], "update posts set card_font='ritual' where id=$1", [pid]);
ok("outra casa não altera post alheio", (other.n ?? 0) === 0, JSON.stringify(other));

// ---- ACL e forma
const acl = await sv("select has_function_privilege('anon','public.posts_styled_guard()','execute') a, has_function_privilege('authenticated','public.posts_styled_guard()','execute') u, (select prosecdef from pg_proc where proname='posts_styled_guard') d, (select proconfig::text from pg_proc where proname='posts_styled_guard') c");
ok("gatilho não é chamável por ninguém do app, security definer com search_path fixo", !acl.rows[0].a && !acl.rows[0].u && acl.rows[0].d && /search_path=public/.test(acl.rows[0].c));
const trg = await sv("select pg_get_triggerdef(oid) d from pg_trigger where tgname='posts_styled_guard'");
ok("gatilho cobre as 7 colunas novas", ["card_font", "card_size", "card_color", "card_align", "card_pos", "card_bold", "card_italic"].every((c) => trg.rows[0].d.includes(c)));
// mutação: sem a restrição, fonte inventada passaria (prova que o teste enxerga a falta)
await su.query("alter table posts drop constraint posts_card_letters_ok");
const mut = await ins(PRO[0], PRO[1], { ...base, font: "comic" });
ok("MUTAÇÃO: sem a restrição, a fonte inventada passaria (o teste detectaria)", !mut.err, mut.err);
await su.query("delete from posts where card_font='comic'"); await su.query(mig);
const back = await ins(PRO[0], PRO[1], { ...base, font: "comic" });
ok("reaplicar a migration restaura a restrição", /posts_card_letters_ok/.test(back.err ?? ""), back.err);
console.log(`\n${total - bad}/${total} ok`);
await su.end?.(); process.exit(bad ? 1 : 0);

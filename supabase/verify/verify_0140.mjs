// Verificação LOCAL da migration 0140 (posts com a cara da sua casa). Uso: node supabase/verify/verify_0140.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 400) : ""}`); if (!c) bad++; };
const name = "vf0140";
const { c: su, failed } = await freshDb(name, { with64: true, max: 139 });
ok("migrations 0001–0139 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; grant select on storage.objects to anon; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0140_posts_com_a_cara_da_casa.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0140000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'casa',$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm]); };
const PLANS = { gratis: [uuid(1), uuid(11)], base: [uuid(2), uuid(12)], intermediario: [uuid(3), uuid(13)], maximo: [uuid(4), uuid(14)] };
const ADM = uuid(9);
for (const [p, [o]] of Object.entries(PLANS)) await mk(o, "Casa " + p);
await mk(ADM, "Admin"); await su.query("insert into admins(user_id,is_owner) values ($1,true)", [ADM]);
for (const [p, [o, h]] of Object.entries(PLANS)) await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [h, o, "Casa " + p, "casa-" + p, p]);

// matriz salva ANTES da migration: edição do proprietário tem de sobreviver
const before = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
const edited = JSON.parse(JSON.stringify(before)); edited.caps.base.quick_replies = 7; edited.copy.base.tagline = "Texto editado pelo dono.";
await su.query("update platform_settings set value=$1 where key='plan_matrix'", [edited]);
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0140 aplica e reaplica sem erro", e === null, e ?? "");
const after = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
ok("matriz salva ganhou a ferramenta: Profissional e Premium sim, Grátis e Essencial não", after.caps.gratis.styled_posts === false && after.caps.base.styled_posts === false && after.caps.intermediario.styled_posts === true && after.caps.maximo.styled_posts === true);
ok("edição do proprietário preservada", after.caps.base.quick_replies === 7 && after.copy.base.tagline === "Texto editado pelo dono.");
ok("benefício aparece uma vez só (mesmo reaplicando) no Profissional, nos outros planos não", after.copy.intermediario.benefits.filter((b) => /cara da sua casa/.test(b.text)).length === 1 && after.copy.maximo.benefits.every((b) => !/cara da sua casa/.test(b.text)));
const defn = (await sv("select plan_matrix_default() v")).rows[0].v;
ok("padrão novo é válido e tem 17 itens por plano", (await sv("select plan_matrix_ok(plan_matrix_default()) o")).rows[0].o === true && Object.keys(defn.caps.maximo).length === 17);
const okp = async (m) => (await sv("select plan_matrix_ok($1::jsonb) o", [m])).rows[0].o;
const mut = (f) => { const m = JSON.parse(JSON.stringify(defn)); f(m); return m; };
ok("validação rejeita: sem a ferramenta, ferramenta com texto, item extra", !(await okp(mut((m) => delete m.caps.base.styled_posts))) && !(await okp(mut((m) => (m.caps.base.styled_posts = "sim")))) && !(await okp(mut((m) => (m.caps.base.inventado = true)))));
// matriz sem edição: padrão idêntico
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");
ok("a matriz do banco = padrão do banco quando ninguém editou", (await sv("select value = plan_matrix_default() ok from platform_settings where key='plan_matrix'")).rows[0].ok === true);
// matriz já com 12 benefícios no Profissional: não estoura o limite
const full = JSON.parse(JSON.stringify(before)); full.copy.intermediario.benefits = Array.from({ length: 12 }, (_, i) => ({ text: "Item " + i, feature: null }));
await su.query("update platform_settings set value=$1 where key='plan_matrix'", [full]);
await su.query(mig);
const f2 = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
ok("com 12 benefícios não acrescenta o 13º, mas a ferramenta entra na matriz", f2.copy.intermediario.benefits.length === 12 && f2.caps.maximo.styled_posts === true);
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");

// ---- posts
const putObj = async (owner, file) => su.query("insert into storage.objects(bucket_id,name,owner) values ('post-images',$1,$2) on conflict do nothing", [`${owner}/${file}`, owner]).catch((x) => su.query("insert into storage.objects(bucket_id,name) values ('post-images',$1)", [`${owner}/${file}`]));
for (const [, [o]] of Object.entries(PLANS)) await putObj(o, "foto.jpg");
const ins = (uid, h, o = {}) => as(uid, (c) => q(c, "insert into posts(house_id,kind,content,card_style,card_image_path,card_rights_ack,image_url) values ($1,'geral',$2,$3,$4,$5,$6) returning id", [h, o.content ?? "Axé a todos!", o.style ?? null, o.path ?? null, o.ack ?? false, o.url ?? null]));
const P = (k) => PLANS[k];
const goodFor = (k) => ({ style: "total", path: `${P(k)[0]}/foto.jpg`, ack: true });
for (const k of ["gratis", "base"]) { const r = await ins(P(k)[0], P(k)[1], goodFor(k)); ok(`${k}: estilizar é recusado pelo banco`, /Profissional/.test(r.err ?? ""), r.err); }
for (const k of ["intermediario", "maximo"]) for (const st of ["total", "parcial"]) { const r = await ins(P(k)[0], P(k)[1], { ...goodFor(k), style: st }); ok(`${k}: estilo ${st} aceito`, !r.err, r.err); }
const k3 = P("intermediario");
const bad1 = [
  ["sem imagem", { style: "total", ack: true }, /escolha a imagem/],
  ["sem confirmar direito de uso", { style: "total", path: `${k3[0]}/foto.jpg`, ack: false }, /direito de usar/],
  ["texto de 401 letras", { style: "total", path: `${k3[0]}/foto.jpg`, ack: true, content: "a".repeat(401) }, /até 400/],
  ["imagem da pasta de outra casa", { style: "total", path: `${P("maximo")[0]}/foto.jpg`, ack: true }, /enviada pela própria plataforma/],
  ["imagem que não existe no bucket", { style: "total", path: `${k3[0]}/nao-existe.jpg`, ack: true }, /enviada pela própria plataforma/],
  ["caminho com ../", { style: "total", path: `${k3[0]}/../${P("maximo")[0]}/foto.jpg`, ack: true }, /enviada pela própria plataforma/],
  ["caminho com subpasta", { style: "total", path: `${k3[0]}/a/foto.jpg`, ack: true }, /enviada pela própria plataforma/],
  ["caminho com ?", { style: "total", path: `${k3[0]}/foto.jpg?x=1`, ack: true }, /enviada pela própria plataforma/],
  ["endereço externo no lugar do caminho", { style: "total", path: "https://evil.com/x.jpg", ack: true }, /enviada pela própria plataforma/],
  ["image_url externo", { style: "total", path: `${k3[0]}/foto.jpg`, ack: true, url: "https://evil.com/x.jpg" }, /enviada pela própria plataforma/],
  ["estilo inventado", { style: "gigante", path: `${k3[0]}/foto.jpg`, ack: true }, /posts_card_style_ok|check/],
];
for (const [n, o, re] of bad1) { const r = await ins(k3[0], k3[1], o); ok(`recusa: ${n}`, re.test(r.err ?? ""), r.err ?? "aceitou!"); }
const scr = await as(k3[0], (c) => q(c, "insert into posts(house_id,kind,content,card_style,card_image_path,card_rights_ack,card_scrim) values ($1,'geral','x','total',$2,true,$3)", [k3[1], `${k3[0]}/foto.jpg`, 20]));
ok("véu fora da faixa 35–85 é recusado", !!scr.err, scr.err);
const scr2 = await as(P("maximo")[0], (c) => q(c, "insert into posts(house_id,kind,content,card_style,card_image_path,card_rights_ack,card_scrim) values ($1,'geral','x','parcial',$2,true,$3) returning card_scrim", [P("maximo")[1], `${P("maximo")[0]}/foto.jpg`, 70]));
ok("véu dentro da faixa é guardado", scr2.rows?.[0]?.card_scrim === 70, scr2.err);
const exact400 = await ins(k3[0], k3[1], { ...goodFor("intermediario"), content: "a".repeat(400) });
ok("texto de exatamente 400 letras é aceito", !exact400.err, exact400.err);
const nrm = await ins(P("gratis")[0], P("gratis")[1], {});
ok("post normal de texto continua igual (Grátis)", !nrm.err, nrm.err);
const nimg = await ins(P("maximo")[0], P("maximo")[1], { url: "https://evil.com/x.jpg" });
ok("post normal com imagem de endereço externo é recusado (qualquer plano)", /enviada pela própria plataforma/.test(nimg.err ?? ""), nimg.err);
const nimg2 = await ins(P("maximo")[0], P("maximo")[1], { path: `${P("maximo")[0]}/foto.jpg` });
ok("imagem sem estilo escolhido é recusada", /escolha o estilo/.test(nimg2.err ?? ""), nimg2.err);
ok("post normal nunca guarda confirmação de direito", (await sv("select bool_or(card_rights_ack) b from posts where card_style is null")).rows[0].b !== true);
const cross = await as(P("intermediario")[0], (c) => q(c, "insert into posts(house_id,kind,content,card_style,card_image_path,card_rights_ack) values ($1,'geral','x','total',$2,true)", [P("maximo")[1], `${P("maximo")[0]}/foto.jpg`]));
ok("não publica na casa dos outros (RLS)", !!cross.err, cross.err);

// ---- a matriz manda (liga/desliga pelo painel) e descer de plano
await su.query("update platform_settings set value = jsonb_set(value,'{caps,base,styled_posts}','true') where key='plan_matrix'");
ok("proprietário liga a ferramenta para o Essencial e vale na hora", !(await ins(P("base")[0], P("base")[1], goodFor("base"))).err);
await su.query("update platform_settings set value = jsonb_set(value,'{caps,intermediario,styled_posts}','false') where key='plan_matrix'");
ok("proprietário desliga para o Profissional e vale na hora", /Profissional/.test((await ins(P("intermediario")[0], P("intermediario")[1], goodFor("intermediario"))).err ?? ""));
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");
const pid = (await ins(P("maximo")[0], P("maximo")[1], goodFor("maximo"))).rows[0].id;
await su.query("set session_replication_role = replica"); await su.query("update houses set plan='base' where id=$1", [P("maximo")[1]]); await su.query("set session_replication_role = origin");
const edit = await as(P("maximo")[0], (c) => q(c, "update posts set content='Texto editado' where id=$1", [pid]));
ok("quem desceu de plano ainda edita o texto do card antigo (não perde o post)", !edit.err && edit.n === 1, edit.err);
const swap = await as(P("maximo")[0], (c) => q(c, "update posts set card_style='parcial' where id=$1", [pid]));
ok("mas não troca o estilo sem o plano", /Profissional/.test(swap.err ?? ""), swap.err);
const grow = await as(P("maximo")[0], (c) => q(c, "update posts set content=$2 where id=$1", [pid, "a".repeat(500)]));
ok("e o texto do card continua limitado a 400", /até 400/.test(grow.err ?? ""), grow.err);
const strip = await as(P("maximo")[0], (c) => q(c, "update posts set card_rights_ack=false where id=$1", [pid]));
ok("não dá para tirar a confirmação de direito de um card estilizado", /direito de usar/.test(strip.err ?? ""), strip.err);

// ---- bucket e armazenamento
await su.query("set session_replication_role = replica"); await su.query("update houses set plan='maximo' where id=$1", [P("maximo")[1]]); await su.query("set session_replication_role = origin");
const bk = (await sv("select public, file_size_limit, allowed_mime_types from storage.buckets where id='post-images'")).rows[0];
ok("bucket post-images: leitura pública, 5 MB, só jpeg/png/webp", bk.public === true && Number(bk.file_size_limit) === 5242880 && bk.allowed_mime_types.join() === "image/jpeg,image/png,image/webp");
const upl = (uid, path) => as(uid, (c) => q(c, "insert into storage.objects(bucket_id,name,owner) values ('post-images',$1,$2)", [path, uid]));
ok("com o plano, envia para a própria pasta", !(await upl(P("maximo")[0], `${P("maximo")[0]}/nova.jpg`)).err);
const noPlan = await upl(P("gratis")[0], `${P("gratis")[0]}/nova.jpg`);
ok("sem o plano, o envio é recusado", !!noPlan.err && /row-level security/.test(noPlan.err), noPlan.err);
const other = await upl(P("maximo")[0], `${P("intermediario")[0]}/nova.jpg`);
ok("não envia para a pasta de outra pessoa", !!other.err && /row-level security/.test(other.err), other.err);
const del = await as(P("intermediario")[0], (c) => q(c, "delete from storage.objects where bucket_id='post-images' and name=$1", [`${P("maximo")[0]}/foto.jpg`]));
ok("não apaga foto de outra casa", del.n === 0, `${del.n}`);
const del2 = await as(P("maximo")[0], (c) => q(c, "delete from storage.objects where bucket_id='post-images' and name=$1", [`${P("maximo")[0]}/nova.jpg`]));
ok("apaga a própria foto", del2.n === 1, `${del2.n} ${del2.err ?? ""}`);
const anonSel = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select count(*)::int n from storage.objects where bucket_id='post-images'"); } finally { await c.end(); } })();
ok("leitura pública das fotos de post", (anonSel.rows?.[0]?.n ?? 0) >= 1, anonSel.err);

// ---- funções
const acl = await sv("select has_function_privilege('anon','public.can_use_styled_posts()','execute') a, has_function_privilege('authenticated','public.can_use_styled_posts()','execute') u, has_function_privilege('authenticated','public.posts_styled_guard()','execute') g");
ok("ACL: anônimo não executa; só authenticated executa can_use_styled_posts; gatilho não é chamável", !acl.rows[0].a && acl.rows[0].u && !acl.rows[0].g);
const fn = await sv("select prosecdef d, proconfig c from pg_proc where proname='posts_styled_guard'");
ok("gatilho security definer com search_path fixo", fn.rows[0].d && /search_path=public/.test(String(fn.rows[0].c)));
ok("não criou tabela nova", (await sv("select count(*)::int n from information_schema.tables where table_schema='public' and table_name like '%styled%'")).rows[0].n === 0);
console.log(`\n${total - bad}/${total} ok`);
await su.end?.(); process.exit(bad ? 1 : 0);

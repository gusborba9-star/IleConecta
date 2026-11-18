// Verificação LOCAL da migration 0162 (Momentos das casas). Uso: node supabase/verify/verify_0162.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 400) : ""}`); if (!c) bad++; };
const name = "vf0162";
const { c: su, failed } = await freshDb(name, { with64: true, max: 161 });
ok("migrations 0001–0161 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; grant select on storage.objects to anon; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0162_momentos_das_casas.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0162000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "casa") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm, type]); };
const PLANS = { gratis: [uuid(1), uuid(11)], base: [uuid(2), uuid(12)], intermediario: [uuid(3), uuid(13)], maximo: [uuid(4), uuid(14)] };
const CLI = [uuid(21), uuid(22), uuid(23), uuid(24)], ADM = uuid(9), NOADM = uuid(8);
for (const [p, [o]] of Object.entries(PLANS)) await mk(o, "Casa " + p);
for (const c of CLI) await mk(c, "Cliente " + c.slice(-2), "cliente");
await mk(ADM, "Admin"); await su.query("insert into admins(user_id,is_owner) values ($1,true)", [ADM]); await mk(NOADM, "Sem admin"); const MOD = uuid(7), SUP = uuid(6); await mk(MOD, "Moderador"); await mk(SUP, "Suporte"); await su.query("insert into admins(user_id,is_owner,perms) values ($1,false,'{moderacao}'), ($2,false,'{suporte}')", [MOD, SUP]);
for (const [p, [o, h]] of Object.entries(PLANS)) await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [h, o, "Casa " + p, "casa-" + p, p]);

// matriz salva ANTES da migration: edição do proprietário tem de sobreviver
const before = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
const edited = JSON.parse(JSON.stringify(before)); edited.caps.base.quick_replies = 7; edited.copy.base.tagline = "Texto editado pelo dono.";
await su.query("update platform_settings set value=$1 where key='plan_matrix'", [edited]);
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0162 aplica e reaplica sem erro", e === null, e ?? "");
const after = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
ok("matriz salva ganhou momentos: 0/3/5/10 por dia e vídeo só no Premium", ["gratis", "base", "intermediario", "maximo"].map((p) => after.caps[p].moments_per_day).join() === "0,3,5,10" && ["gratis", "base", "intermediario", "maximo"].map((p) => after.caps[p].moment_video).join() === "false,false,false,true", JSON.stringify(after.caps.base));
ok("edição do proprietário preservada", after.caps.base.quick_replies === 7 && after.copy.base.tagline === "Texto editado pelo dono.");
ok("textos de momentos entram uma vez só (Essencial e Premium), mesmo reaplicando", after.copy.base.benefits.filter((b) => /Momentos no topo do feed/.test(b.text)).length === 1 && after.copy.maximo.benefits.filter((b) => /Momentos em vídeo/.test(b.text)).length === 1);
const defn = (await sv("select plan_matrix_default() v")).rows[0].v;
ok("padrão novo é válido e tem 19 itens por plano", (await sv("select plan_matrix_ok(plan_matrix_default()) o")).rows[0].o === true && Object.keys(defn.caps.maximo).length === 19);
const okp = async (m) => (await sv("select plan_matrix_ok($1::jsonb) o", [m])).rows[0].o;
const mut = (f) => { const m = JSON.parse(JSON.stringify(defn)); f(m); return m; };
ok("validação rejeita: sem a chave, número fora da faixa, texto no lugar de liga/desliga", !(await okp(mut((m) => delete m.caps.base.moments_per_day))) && !(await okp(mut((m) => (m.caps.base.moments_per_day = 51)))) && !(await okp(mut((m) => (m.caps.base.moment_video = "sim")))));
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");
const full = JSON.parse(JSON.stringify(before)); full.copy.base.benefits = Array.from({ length: 12 }, (_, i) => ({ text: "Item " + i, feature: null }));
await su.query("update platform_settings set value=$1 where key='plan_matrix'", [full]); await su.query(mig);
const f2 = (await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v;
ok("com 12 benefícios não acrescenta o 13º, mas as chaves entram na matriz", f2.copy.base.benefits.length === 12 && f2.caps.maximo.moments_per_day === 10);
await su.query("update platform_settings set value=plan_matrix_default() where key='plan_matrix'");

// ---- arquivos e armazenamento
const upl = (uid, bucketPath) => as(uid, (c) => q(c, "insert into storage.objects(bucket_id,name,owner) values ('moments',$1,$2)", [bucketPath, uid]));
ok("Grátis não envia arquivo de momento", !!(await upl(PLANS.gratis[0], `${PLANS.gratis[0]}/a.jpg`)).err);
ok("Essencial envia foto", !(await upl(PLANS.base[0], `${PLANS.base[0]}/a.jpg`)).err);
ok("Essencial NÃO envia vídeo (mp4, webm, mov)", !!(await upl(PLANS.base[0], `${PLANS.base[0]}/v.mp4`)).err && !!(await upl(PLANS.base[0], `${PLANS.base[0]}/v.webm`)).err && !!(await upl(PLANS.base[0], `${PLANS.base[0]}/v.MOV`)).err);
ok("Profissional NÃO envia vídeo, Premium envia", !!(await upl(PLANS.intermediario[0], `${PLANS.intermediario[0]}/v.mp4`)).err && !(await upl(PLANS.maximo[0], `${PLANS.maximo[0]}/v.mp4`)).err);
ok("ninguém envia na pasta de outra casa", !!(await upl(PLANS.base[0], `${PLANS.maximo[0]}/x.jpg`)).err);
ok("cliente não envia arquivo de momento", !!(await upl(CLI[0], `${CLI[0]}/x.jpg`)).err);
const put = (owner, file) => su.query("insert into storage.objects(bucket_id,name,owner) values ('moments',$1,$2) on conflict do nothing", [`${owner}/${file}`, owner]);
const anonSel = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select count(*)::int n from storage.objects where bucket_id='moments'"); } finally { await c.end(); } })();
ok("leitura do bucket é pública", !anonSel.err && anonSel.rows[0].n >= 1);
const del = await as(PLANS.maximo[0], (c) => q(c, "delete from storage.objects where bucket_id='moments' and name=$1", [`${PLANS.base[0]}/a.jpg`]));
ok("casa não apaga arquivo de outra casa", del.n === 0);

// ---- trava dos momentos
const ins = (uid, h, o = {}) => as(uid, (c) => q(c, "insert into stories(house_id,media_path,poster_path,duration_s,caption,link_kind,link_id,expires_at,image_url,hidden_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, media_kind, expires_at, image_url, hidden_at, caption",
  [h, o.path ?? null, o.poster ?? null, o.dur ?? null, o.caption ?? null, o.lk ?? null, o.li ?? null, o.exp ?? null, o.img ?? null, o.hid ?? null]));
const [G, B, I, M] = [PLANS.gratis, PLANS.base, PLANS.intermediario, PLANS.maximo];
for (const f of ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"]) await put(B[0], f);
const rG = await ins(G[0], G[1], { path: `${G[0]}/a.jpg` });
ok("Grátis não publica momento", /a partir do plano Essencial/.test(rG.err ?? ""), rG.err);
const r1 = await ins(B[0], B[1], { path: `${B[0]}/a.jpg`, exp: "2099-01-01", img: "https://evil.example/x.jpg", hid: "2020-01-01", caption: "   " });
ok("Essencial publica foto; validade 24 h e endereço externo/oculto ignorados; legenda em branco vira nada", !r1.err && r1.rows[0].media_kind === "image" && r1.rows[0].image_url === null && r1.rows[0].hidden_at === null && r1.rows[0].caption === null && new Date(r1.rows[0].expires_at) - Date.now() < 24 * 3600e3 + 5000 && new Date(r1.rows[0].expires_at) - Date.now() > 24 * 3600e3 - 60000, r1.err ?? JSON.stringify(r1.rows[0]));
ok("legenda com mais de 140 caracteres é recusada", !!(await ins(B[0], B[1], { path: `${B[0]}/b.jpg`, caption: "x".repeat(141) })).err);
ok("arquivo que não existe no armazenamento é recusado", !!(await ins(B[0], B[1], { path: `${B[0]}/naoexiste.jpg` })).err);
ok("arquivo de outra casa é recusado", !!(await ins(B[0], B[1], { path: `${M[0]}/v.mp4` })).err);
ok("endereço externo como arquivo é recusado", !!(await ins(B[0], B[1], { path: "https://evil.example/x.jpg" })).err);
ok("extensão fora da lista é recusada", !!(await ins(B[0], B[1], { path: `${B[0]}/a.jpg/../x.exe` })).err);
await put(B[0], "v.mp4"); await put(B[0], "p.jpg");
const rv = await ins(B[0], B[1], { path: `${B[0]}/v.mp4`, poster: `${B[0]}/p.jpg`, dur: 20 });
ok("Essencial NÃO publica vídeo (mesmo com o arquivo já no armazenamento)", /plano Premium/.test(rv.err ?? ""), rv.err);
ok("não publica em casa de outra pessoa", !!(await ins(I[0], B[1], { path: `${B[0]}/b.jpg` })).err);
const r2 = await ins(B[0], B[1], { path: `${B[0]}/b.jpg`, caption: "  Olá  " }), r3 = await ins(B[0], B[1], { path: `${B[0]}/c.jpg` });
ok("Essencial publica 3 por dia; legenda aparada", !r2.err && !r3.err && r2.rows[0].caption === "Olá");
const r4 = await ins(B[0], B[1], { path: `${B[0]}/d.jpg` });
ok("4º momento do dia é recusado com o limite do plano", /limite de 3 momento/.test(r4.err ?? ""), r4.err);
await su.query("update stories set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = $1", [r1.rows[0].id]);
ok("momento de mais de 24 h sai da conta e libera outro", !(await ins(B[0], B[1], { path: `${B[0]}/d.jpg` })).err);
// dois envios ao mesmo tempo no último lugar do limite
await su.query("delete from stories where house_id=$1", [I[1]]);
for (const f of ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"]) await put(I[0], f);
for (const f of ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]) await ins(I[0], I[1], { path: `${I[0]}/${f}` });
const race = await Promise.all([ins(I[0], I[1], { path: `${I[0]}/e.jpg` }), ins(I[0], I[1], { path: `${I[0]}/f.jpg` })]);
ok("dois envios simultâneos no último lugar: só um passa (limite 5)", race.filter((x) => !x.err).length === 1 && (await sv("select count(*)::int n from stories where house_id=$1", [I[1]])).rows[0].n === 5, JSON.stringify(race.map((x) => x.err ?? "ok")));
// Premium: vídeo
for (const f of ["v.mp4", "p.jpg", "v2.mov", "p2.jpg"]) await put(M[0], f);
ok("Premium publica vídeo com capa e duração", await (async () => { const r = await ins(M[0], M[1], { path: `${M[0]}/v.mp4`, poster: `${M[0]}/p.jpg`, dur: 30 }); return !r.err && r.rows[0].media_kind === "video"; })());
ok("vídeo sem capa é recusado", !!(await ins(M[0], M[1], { path: `${M[0]}/v2.mov`, dur: 10 })).err);
ok("vídeo sem duração, com 0 s ou com mais de 31 s é recusado", !!(await ins(M[0], M[1], { path: `${M[0]}/v2.mov`, poster: `${M[0]}/p2.jpg` })).err && !!(await ins(M[0], M[1], { path: `${M[0]}/v2.mov`, poster: `${M[0]}/p2.jpg`, dur: 0 })).err && !!(await ins(M[0], M[1], { path: `${M[0]}/v2.mov`, poster: `${M[0]}/p2.jpg`, dur: 45 })).err);
ok("capa que não é imagem é recusada", !!(await ins(M[0], M[1], { path: `${M[0]}/v2.mov`, poster: `${M[0]}/v.mp4`, dur: 10 })).err);
// vínculo com serviço / ritual
const svc = (h, active) => su.query("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'trabalho','Serviço de teste','Descrição longa o suficiente para o serviço ser válido e aceito.',1000,$2) returning id", [h, active]).then((r) => r.rows[0].id, (x) => { throw new Error("serviço: " + x.message); });
const sOwn = await svc(M[1], true), sOff = await svc(M[1], false), sOther = await svc(B[1], true);
await put(M[0], "s1.jpg"); await put(M[0], "s2.jpg"); await put(M[0], "s3.jpg"); await put(M[0], "s4.jpg");
ok("vínculo com serviço da própria casa vale", !(await ins(M[0], M[1], { path: `${M[0]}/s1.jpg`, lk: "service", li: sOwn })).err);
ok("serviço desativado ou de outra casa é recusado", !!(await ins(M[0], M[1], { path: `${M[0]}/s2.jpg`, lk: "service", li: sOff })).err && !!(await ins(M[0], M[1], { path: `${M[0]}/s2.jpg`, lk: "service", li: sOther })).err);
ok("vínculo pela metade é recusado (tipo sem id)", !!(await ins(M[0], M[1], { path: `${M[0]}/s2.jpg`, lk: "service" })).err);
const evId = await su.query("insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Ritual de teste','Descrição longa o suficiente para o ritual ser válido e aceito.',5000,5,now()+interval '10 days','publicado',60) returning id", [M[1]]).then((r) => r.rows[0].id, (x) => { throw new Error("evento: " + x.message); });
const evDraft = await su.query("insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Rascunho','Descrição longa o suficiente para o ritual ser válido e aceito.',5000,5,now()+interval '10 days','rascunho',60) returning id", [M[1]]).then((r) => r.rows[0].id);
ok("vínculo com ritual publicado vale; rascunho é recusado", !(await ins(M[0], M[1], { path: `${M[0]}/s3.jpg`, lk: "event", li: evId })).err && !!(await ins(M[0], M[1], { path: `${M[0]}/s4.jpg`, lk: "event", li: evDraft })).err);
ok("a casa não consegue editar um momento depois de publicado", (await as(M[0], (c) => q(c, "update stories set expires_at = now() + interval '30 days', hidden_at = null where house_id=$1", [M[1]]))).n === 0);
ok("cliente não publica", !!(await as(CLI[0], (c) => q(c, "insert into stories(house_id,media_path) values ($1,$2)", [M[1], `${M[0]}/s4.jpg`]))).err);
ok("casa apaga o próprio momento; o de outra casa, não", (await as(B[0], (c) => q(c, "delete from stories where house_id=$1 and media_path=$2", [B[1], `${B[0]}/b.jpg`]))).n === 1 && (await as(B[0], (c) => q(c, "delete from stories where house_id=$1", [M[1]]))).n === 0);

// ---- leitura e carrossel
const vis = (uid) => as(uid, (c) => q(c, "select count(*)::int n from stories"));
const feed = (uid) => as(uid, async (c) => (await c.query("select moments_feed() f")).rows[0].f);
ok("cliente vê os momentos no ar", (await vis(CLI[0])).rows[0].n >= 5);
const f0 = await feed(CLI[0]);
ok("carrossel: casas com momento, itens em ordem, sem seguir = followed falso", Array.isArray(f0) && f0.length === 3 && f0.every((g) => g.followed === false && g.items.length >= 1) && !JSON.stringify(f0).includes("evil.example"), JSON.stringify(f0.map((g) => [g.name, g.items.length])));
const gm = f0.find((g) => g.slug === "casa-maximo");
ok("carrossel: vídeo traz capa e duração; vínculo traz o título do serviço/ritual", gm.items.some((i) => i.kind === "video" && i.poster && i.duration === 30) && gm.items.some((i) => i.link_kind === "service" && i.link_title === "Serviço de teste") && gm.items.some((i) => i.link_kind === "event" && i.link_title === "Ritual de teste"));
await su.query("insert into follows(follower_id,house_id) values ($1,$2)", [CLI[0], I[1]]);
ok("seguir marca followed", (await feed(CLI[0])).find((g) => g.slug === "casa-intermediario").followed === true && (await feed(CLI[1])).find((g) => g.slug === "casa-intermediario").followed === false);
ok("sem login o carrossel não é entregue (anon sem permissão)", await (async () => { const c = await connect(name); try { await c.query("set role anon"); return !!(await q(c, "select moments_feed() f")).err; } finally { await c.end(); } })());
ok("casa vê o próprio momento oculto; cliente não", await (async () => {
  const id = (await su.query("select id from stories where house_id=$1 limit 1", [I[1]])).rows[0].id;
  await su.query("update stories set hidden_at=now() where id=$1", [id]);
  const own = await as(I[0], (c) => q(c, "select count(*)::int n from stories where id=$1", [id])), other = await as(CLI[0], (c) => q(c, "select count(*)::int n from stories where id=$1", [id]));
  const inFeed = JSON.stringify(await feed(CLI[0])).includes(id);
  await su.query("update stories set hidden_at=null where id=$1", [id]);
  return own.rows[0].n === 1 && other.rows[0].n === 0 && !inFeed; })());
ok("momento vencido some da leitura e do carrossel", await (async () => {
  const id = (await su.query("select id from stories where house_id=$1 limit 1", [I[1]])).rows[0].id;
  await su.query("update stories set expires_at=now()-interval '1 minute' where id=$1", [id]);
  const other = await as(CLI[0], (c) => q(c, "select count(*)::int n from stories where id=$1", [id])); const inFeed = JSON.stringify(await feed(CLI[0])).includes(id);
  await su.query("update stories set expires_at=now()+interval '12 hours' where id=$1", [id]);
  return other.rows[0].n === 0 && !inFeed; })());

// ---- denúncias
const target = (await su.query("select id from stories where house_id=$1 order by created_at limit 1", [M[1]])).rows[0].id;
const rep = (uid, id, r = "golpe") => as(uid, (c) => q(c, "select report_moment($1,$2) r", [id, r]));
ok("sem login não denuncia", await (async () => { const c = await connect(name); try { await c.query("set role anon"); return !!(await q(c, "select report_moment($1,'golpe')", [target])).err; } finally { await c.end(); } })());
ok("motivo inválido é recusado", /motivo/.test((await rep(CLI[0], target, "xyz")).err ?? ""));
ok("a casa não denuncia o próprio momento", /próprio/.test((await rep(M[0], target)).err ?? ""));
ok("1ª denúncia entra; repetida da mesma pessoa não duplica; momento segue no ar", !(await rep(CLI[0], target)).err && !(await rep(CLI[0], target)).err && (await sv("select count(*)::int n from moment_reports where story_id=$1", [target])).rows[0].n === 1 && (await sv("select hidden_at from stories where id=$1", [target])).rows[0].hidden_at === null);
ok("a denúncia guarda a cópia do arquivo (prova)", (await sv("select media_path, caption from moment_reports where story_id=$1", [target])).rows[0].media_path?.startsWith(M[0]));
await rep(CLI[1], target, "assedio");
ok("2 denúncias: ainda no ar", (await sv("select hidden_at from stories where id=$1", [target])).rows[0].hidden_at === null);
await rep(CLI[2], target, "outro");
ok("3 pessoas diferentes escondem o momento", (await sv("select hidden_at from stories where id=$1", [target])).rows[0].hidden_at !== null && !JSON.stringify(await feed(CLI[3])).includes(target));
ok("denunciar o que já está oculto/indisponível é recusado", /indisponível/.test((await rep(CLI[3], uuid(999))).err ?? ""));
ok("limite de 20 denúncias por dia por pessoa", await (async () => {
  for (let i = 0; i < 20; i++) await su.query("insert into moment_reports(story_id,house_id,reporter_id,reason) values ($1,$2,$3,'outro')", [`d0162999-0000-0000-0000-${String(i).padStart(12, "0")}`, M[1], CLI[3]]);
  const r = await rep(CLI[3], (await su.query("select id from stories where house_id=$1 and hidden_at is null limit 1", [M[1]])).rows[0].id);
  await su.query("delete from moment_reports where story_id::text like 'd0162999%'");
  return /Muitas denúncias/.test(r.err ?? ""); })());
ok("cliente comum não vê a tabela de denúncias nem a fila", !!(await as(CLI[0], (c) => q(c, "select * from moment_reports"))).err && !!(await as(NOADM, (c) => q(c, "select * from admin_moment_reports()"))).err);
const q1 = await as(ADM, (c) => q(c, "select * from admin_moment_reports()"));
ok("administração vê a fila: 1 momento, 3 denúncias, motivos, oculto", q1.rows.length === 1 && Number(q1.rows[0].n_reports) === 3 && q1.rows[0].hidden === true && q1.rows[0].reasons.length === 3, JSON.stringify(q1.rows ?? q1.err));
ok("administrador sem o módulo de moderação (suporte) não vê a fila nem decide", !!(await as(SUP, (c) => q(c, "select * from admin_moment_reports()"))).err && !!(await as(SUP, (c) => q(c, "select admin_moment_decide($1,'manter')", [target]))).err);
ok("moderador vê a fila", !(await as(MOD, (c) => q(c, "select * from admin_moment_reports()"))).err);
ok("só a administração decide", !!(await as(NOADM, (c) => q(c, "select admin_moment_decide($1,'manter')", [target]))).err && !!(await as(CLI[0], (c) => q(c, "select admin_moment_decide($1,'manter')", [target]))).err);
ok("ação inválida é recusada", !!(await as(ADM, (c) => q(c, "select admin_moment_decide($1,'apagar')", [target]))).err);
await as(ADM, (c) => c.query("select admin_moment_decide($1,'manter','ok')", [target]));
const st1 = (await sv("select hidden_at from stories where id=$1", [target])).rows[0];
ok("'manter' volta ao ar e fecha as denúncias como improcedentes", st1.hidden_at === null && (await sv("select count(*)::int n from moment_reports where story_id=$1 and status='improcedente' and resolved_at is not null", [target])).rows[0].n === 3);
ok("decidir de novo sem denúncia aberta é recusado", !!(await as(ADM, (c) => q(c, "select admin_moment_decide($1,'manter')", [target]))).err);
const target2 = (await su.query("select id from stories where house_id=$1 and hidden_at is null and id<>$2 order by created_at limit 1", [M[1], target])).rows[0].id;
for (const c of CLI.slice(0, 3)) await rep(c, target2);
await as(ADM, (c) => c.query("select admin_moment_decide($1,'remover','golpe')", [target2]));
const st2 = (await sv("select hidden_at, expires_at <= now() ex from stories where id=$1", [target2])).rows[0];
ok("'remover' tira do ar na hora e fecha como procedentes", st2.hidden_at !== null && st2.ex === true && (await sv("select count(*)::int n from moment_reports where story_id=$1 and status='procedente'", [target2])).rows[0].n === 3);

// ---- limpeza (48 h)
await su.query("delete from moment_reports"); await su.query("delete from stories"); await su.query("delete from storage.objects where bucket_id='moments'");
const mkOld = async (o, tag, ageH, withPoster) => { await put(o, tag + ".mp4"); if (withPoster) await put(o, tag + "p.jpg"); const id = (await su.query("insert into stories(house_id,media_path,poster_path,duration_s) values ($1,$2,$3,$4) returning id", [M[1], `${M[0]}/${tag}.mp4`, withPoster ? `${M[0]}/${tag}p.jpg` : null, withPoster ? 10 : null])).rows[0].id; await su.query("update stories set created_at = now() - ($2 || ' hours')::interval, expires_at = now() - ($2 || ' hours')::interval + interval '24 hours' where id=$1", [id, String(ageH)]); return id; };
// o limite diário do Premium (10) não atrapalha: espaça os testes apagando entre eles
const sOld = await mkOld(M[0], "old", 49, true);
const sNew = await mkOld(M[0], "new", 30, true);
const list = async () => (await su.query("select bucket, path, kind from files_to_purge(200) where bucket='moments' order by kind, path")).rows;
let L = await list();
ok("48 h depois: arquivo e capa entram na limpeza; o de 30 h não", L.some((x) => x.kind === "moment" && x.path.endsWith("/old.mp4")) && L.some((x) => x.kind === "moment_poster" && x.path.endsWith("/oldp.jpg")) && !L.some((x) => /new/.test(x.path)), JSON.stringify(L));
ok("a limpeza de sempre segue funcionando (consulta sem erro)", !(await sv("select count(*) from files_to_purge(200)")).err);
// denúncia aberta segura o arquivo
await su.query("insert into moment_reports(story_id,house_id,reporter_id,reason,media_path,poster_path,status) values ($1,$2,$3,'golpe',$4,$5,'aberta')", [sOld, M[1], CLI[0], `${M[0]}/old.mp4`, `${M[0]}/oldp.jpg`]);
L = await list(); ok("denúncia aberta segura o arquivo e a capa", !L.some((x) => /old/.test(x.path)), JSON.stringify(L));
await su.query("update moment_reports set status='procedente', resolved_at = now() - interval '10 days'");
L = await list(); ok("denúncia resolvida há 10 dias ainda segura", !L.some((x) => /old/.test(x.path)));
await su.query("update moment_reports set resolved_at = now() - interval '91 days'");
L = await list(); ok("resolvida há mais de 90 dias libera a limpeza", L.some((x) => /old\.mp4/.test(x.path)) && L.some((x) => /oldp\.jpg/.test(x.path)));
// órfãos
await put(M[0], "orfao.jpg"); await put(M[0], "orfao-novo.jpg");
await su.query("update storage.objects set created_at = now() - interval '3 days' where name = $1", [`${M[0]}/orfao.jpg`]);
await su.query("update storage.objects set created_at = now() - interval '3 days' where name like $1", [`${M[0]}/new%`]);
L = await list();
ok("arquivo sem momento com mais de 2 dias vira órfão; o recente e o que tem momento, não", L.some((x) => x.kind === "orphan" && x.path.endsWith("/orfao.jpg")) && !L.some((x) => x.path.endsWith("orfao-novo.jpg")) && !L.some((x) => x.kind === "orphan" && /new/.test(x.path)), JSON.stringify(L));
// aplica a limpeza
await su.query("delete from moment_reports");
const items = (await su.query("select bucket, path, kind, ref from files_to_purge(200) where bucket='moments'")).rows;
const n = (await su.query("select files_purged($1::jsonb) n", [JSON.stringify(items)])).rows[0].n;
const oldRow = (await su.query("select * from stories where id=$1", [sOld])).rows;
ok("depois da limpeza a linha do momento antigo também sai (sem arquivos e sem denúncia)", Number(n) >= 2 && oldRow.length === 0 && (await su.query("select 1 from stories where id=$1", [sNew])).rowCount === 1, `${n}`);
// só o arquivo saiu, a capa falhou: a linha fica com a capa e tenta de novo
const sHalf = await mkOld(M[0], "half", 50, true);
await su.query("select files_purged($1::jsonb)", [JSON.stringify([{ bucket: "moments", path: `${M[0]}/half.mp4`, kind: "moment", ref: sHalf }])]);
const half = (await su.query("select media_path, poster_path, purged_at from stories where id=$1", [sHalf])).rows[0];
ok("se só o vídeo saiu, a linha fica com a capa e deixa de aparecer para as pessoas", half && half.media_path === null && half.poster_path !== null && half.purged_at !== null && (await as(CLI[0], (c) => q(c, "select count(*)::int n from stories where id=$1", [sHalf]))).rows[0].n === 0);
// denúncia mantém a linha mesmo sem arquivos
await su.query("insert into moment_reports(story_id,house_id,reporter_id,reason) values ($1,$2,$3,'outro')", [sHalf, M[1], CLI[0]]);
await su.query("select files_purged($1::jsonb)", [JSON.stringify([{ bucket: "moments", path: `${M[0]}/halfp.jpg`, kind: "moment_poster", ref: sHalf }])]);
ok("com denúncia, a linha fica mesmo depois de todos os arquivos saírem", (await su.query("select 1 from stories where id=$1", [sHalf])).rowCount === 1);
ok("nenhuma permissão aberta demais: funções internas só para o serviço", !!(await as(CLI[0], (c) => q(c, "select * from files_to_purge(5)"))).err && !!(await as(M[0], (c) => q(c, "select files_purged('[]'::jsonb)"))).err);
await su.end(); console.log(bad ? `${bad} FALHA(S) de ${total}` : `TUDO OK (${total})`); process.exit(bad ? 1 : 0);

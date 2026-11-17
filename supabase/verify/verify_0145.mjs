// Verificação LOCAL da migration 0145 (texto travado no impulsionamento). Uso: node supabase/verify/verify_0145.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0145";
const { c: su, failed } = await freshDb(name, { with64: true, max: 144 });
ok("migrations 0001–0144 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
// as funções passam a ser concedidas só pelo que a migration manda
const mig = readFileSync(new URL("../migrations/0145_texto_travado_no_impulsionamento.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0145 aplica e reaplica sem erro", e === null, e ?? "");
await su.query("revoke execute on function public.post_text_lock_state(uuid) from public, anon, authenticated; revoke execute on function public.my_post_text_locks() from anon");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0145000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, t = "casa") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set display_name=excluded.display_name", [id, t, nm]); };
const O1 = uuid(1), H1 = uuid(11), O2 = uuid(2), H2 = uuid(12), CL = uuid(21);
await mk(O1, "Casa 1"); await mk(O2, "Casa 2"); await mk(CL, "Cliente", "cliente");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa 1','casa-1','maximo'),($3,$4,'Casa 2','casa-2','maximo')", [H1, O1, H2, O2]);
const post = async (h = H1, content = "Axé") => (await sv("insert into posts(house_id,kind,content) values ($1,'geral',$2) returning id", [h, content])).rows[0].id;
const promo = async (p, status, ago = "0 minutes", h = H1) => (await sv("insert into promotions(house_id,kind,scope,item_type,item_id,days,amount_cents,authorized_at,status) values ($1,'boost','cidade','post',$2,3,1000,now() - $3::interval,$4) returning id", [h, p, ago, status])).rows[0].id;
const edit = (uid, id, text) => as(uid, (c) => q(c, "update posts set content=$2 where id=$1", [id, text]));
const content = async (id) => (await sv("select content from posts where id=$1", [id])).rows[0].content;
const st = async (id) => (await sv("select public.post_text_lock_state($1) s", [id])).rows[0].s;
const LOCK = /só pode ser corrigido uma vez/;

// ---- sem impulsionamento: livre
let P = await post(); ok("sem impulsionamento: estado livre", await st(P) === "livre");
let r = await edit(O1, P, "um"); r = await edit(O1, P, "dois"); r = await edit(O1, P, "três");
ok("sem impulsionamento: edita quantas vezes quiser", !r.err && await content(P) === "três", r.err);

// ---- impulsionado agora: uma correção
for (const status of ["ativa", "aguardando"]) {
  P = await post(); await promo(P, status);
  ok(`${status}, recém-contratado: estado 'correcao'`, await st(P) === "correcao");
  r = await edit(O1, P, "Correção feita");
  ok(`${status}: a primeira correção passa`, !r.err && r.n === 1 && await content(P) === "Correção feita", r.err);
  ok(`${status}: depois da correção o estado é 'travado'`, await st(P) === "travado");
  r = await edit(O1, P, "Troca total da oferta");
  ok(`${status}: a segunda alteração é recusada com mensagem clara`, LOCK.test(r.err ?? "") && await content(P) === "Correção feita", r.err);
  r = await edit(O1, P, "Correção feita");
  ok(`${status}: regravar o mesmo texto não é alteração (não dá erro)`, !r.err);
}
// ---- janela de 60 minutos
for (const [ago, esperado] of [["59 minutes", true], ["61 minutes", false], ["2 days", false], ["30 minutes", true]]) {
  P = await post(); await promo(P, "ativa", ago); r = await edit(O1, P, "Mudou");
  ok(`contratado há ${ago}: ${esperado ? "ainda corrige" : "texto travado"}`, esperado ? !r.err && r.n === 1 : LOCK.test(r.err ?? "") && await content(P) === "Axé", r.err);
}
P = await post(); await promo(P, "ativa", "61 minutes");
ok("passada a hora sem nenhuma correção: estado 'travado'", await st(P) === "travado");
// ---- terminou: libera
for (const status of ["encerrada", "cancelada", "reembolsada"]) {
  P = await post(); await promo(P, status, "3 days"); r = await edit(O1, P, "livre de novo");
  ok(`impulsionamento ${status}: o texto volta a ser livre`, !r.err && r.n === 1 && await st(P) === "livre", r.err);
}
// ---- edição anterior ao impulsionamento não gasta a correção
P = await post(); await edit(O1, P, "ajuste antes"); await new Promise((x) => setTimeout(x, 30)); await promo(P, "ativa");
r = await edit(O1, P, "correção depois"); ok("editou antes de contratar: ainda tem a correção do impulsionamento", !r.err && await content(P) === "correção depois", r.err);
// ---- novas compras não reabrem o prazo (conta a mais antiga em andamento)
P = await post(); await promo(P, "ativa", "2 hours"); await promo(P, "aguardando", "0 minutes");
ok("compra antiga + compra nova: continua travado", await st(P) === "travado");
r = await edit(O1, P, "reabrindo pela compra nova"); ok("…e comprar mais dias não reabre a edição", LOCK.test(r.err ?? "") && await content(P) === "Axé", r.err);
P = await post(); const old = await promo(P, "ativa", "2 hours"); await promo(P, "aguardando", "0 minutes"); await sv("update promotions set status='encerrada' where id=$1", [old]);
ok("a antiga terminou e só resta a nova: a hora conta da nova", await st(P) === "correcao");
// ---- tentativas de burlar
P = await post(); await promo(P, "ativa", "2 hours");
r = await as(O1, (c) => q(c, "update promotions set authorized_at=now() where item_id=$1", [P])); ok("a casa não consegue mudar a data da compra", r.n === 0 || !!r.err, r.err);
r = await as(O1, (c) => q(c, "update promotions set status='cancelada' where item_id=$1", [P])); ok("…nem cancelar a própria compra para liberar o texto", r.n === 0 || !!r.err, r.err);
r = await as(O1, (c) => q(c, "update posts set edited_at=null, content='burla' where id=$1", [P])); ok("apagar o 'editado' junto com o texto não destrava", LOCK.test(r.err ?? "") && await content(P) === "Axé", r.err);
r = await as(O1, (c) => q(c, "update posts set created_at=now(), content='burla' where id=$1", [P])); ok("mudar a data do post junto não destrava", LOCK.test(r.err ?? ""), r.err);
r = await as(O1, (c) => q(c, "update posts set content='burla', card_style=null where id=$1", [P])); ok("texto + estilo juntos na mesma gravação: recusado", !!r.err && await content(P) === "Axé", r.err);
P = await post(); await promo(P, "ativa");
r = await as(O1, (c) => q(c, "update posts set content='dentro da hora', card_scrim=80 where id=$1", [P]));
ok("dentro da hora, texto + imagem/estilo juntos: recusado e nada muda", !!r.err && await content(P) === "Axé", r.err);
ok("…e a correção continua disponível depois da tentativa recusada", await st(P) === "correcao");
r = await as(O1, (c) => q(c, "delete from posts where id=$1", [P])); ok("excluir continua bloqueado (0143)", /está impulsionada/.test(r.err ?? ""), r.err);
// outra casa e cliente
r = await edit(O2, P, "invasão"); ok("outra casa não edita (a regra de dono vale)", r.n === 0 && await content(P) === "Axé");
r = await edit(CL, P, "invasão"); ok("cliente não edita", r.n === 0 && await content(P) === "Axé");
P = await post(); await promo(P, "ativa", "5 hours");
r = await q(su, "update posts set content='feito pela administração' where id=$1", [P]); ok("administração/SQL (sem usuário) edita mesmo travado", !r.err && await content(P) === "feito pela administração", r.err);

// ---- a pergunta da tela (my_post_text_locks)
const A = await post(H1, "A"), B = await post(H1, "B"), F = await post(H1, "F"), X = await post(H2, "X");
await promo(A, "ativa", "10 minutes"); await promo(B, "ativa", "3 hours"); await promo(X, "ativa", "10 minutes", H2);
const locks = (uid) => as(uid, (c) => q(c, "select * from public.my_post_text_locks()"));
r = await locks(O1); const m = Object.fromEntries((r.rows ?? []).map((x) => [x.post_id, x]));
ok("a casa vê o estado dos próprios posts impulsionados", m[A]?.state === "correcao" && m[B]?.state === "travado", r.err);
ok("post sem impulsionamento não aparece", !m[F]);
ok("post de outra casa não aparece", !m[X]);
ok("'até quando' só vem junto da correção disponível (~50 min)", m[B]?.until === null && Math.abs(new Date(m[A].until) - (Date.now() + 50 * 60000)) < 5 * 60000);
r = await locks(O2); ok("outra casa só vê os dela", (r.rows ?? []).length === 1 && r.rows[0].post_id === X);
r = await locks(CL); ok("cliente não vê nada", (r.rows ?? []).length === 0);
r = await as(null, (c) => q(c, "select * from public.my_post_text_locks()")); ok("sem login: lista vazia", (r.rows ?? []).length === 0);
r = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select * from public.my_post_text_locks()"); } finally { await c.end(); } })();
ok("anon não chama a pergunta da tela", !!r.err);
r = await as(O1, (c) => q(c, "select public.post_text_lock_state($1)", [A])); ok("a função interna não é chamável por quem usa o app", !!r.err, r.err);
// ---- forma
const acl = await sv(`select (select bool_and(prosecdef) from pg_proc where proname in ('post_text_lock_state','my_post_text_locks','posts_edit_guard')) d,
  (select bool_and(coalesce(proconfig::text,'') like '%search_path=public%') from pg_proc where proname in ('post_text_lock_state','my_post_text_locks','posts_edit_guard')) c`);
ok("security definer com search_path fixo", acl.rows[0].d && acl.rows[0].c);
// ---- mutação: voltar à guarda da 0144 deixaria trocar o texto à vontade
const g144 = readFileSync(new URL("../migrations/0144_editar_post_e_moderar_comentarios.sql", import.meta.url), "utf8").match(/create or replace function public\.posts_edit_guard[\s\S]*?end \$\$;/)[0];
await su.query(g144);
P = await post(); await promo(P, "ativa", "5 hours"); r = await edit(O1, P, "furou");
ok("MUTAÇÃO: com a guarda antiga o texto mudaria depois da hora (o teste detecta)", !r.err && await content(P) === "furou");
await su.query(mig); await su.query("revoke execute on function public.post_text_lock_state(uuid) from public, anon, authenticated");
P = await post(); await promo(P, "ativa", "5 hours"); r = await edit(O1, P, "furou2");
ok("reaplicar a migration restaura a trava", LOCK.test(r.err ?? ""), r.err);
// mutação 2: janela trocada por 'max' (compra nova reabriria): simulado trocando min por max na função
const fn = (await sv("select pg_get_functiondef('public.post_text_lock_state(uuid)'::regprocedure) d")).rows[0].d.replace("select min(p.authorized_at)", "select max(p.authorized_at)");
await su.query(fn);
P = await post(); await promo(P, "ativa", "2 hours"); await promo(P, "aguardando", "0 minutes"); r = await edit(O1, P, "reabriu");
ok("MUTAÇÃO: contar pela compra mais NOVA deixaria a compra nova reabrir a edição", !r.err && await content(P) === "reabriu");
await su.query(mig); await su.query("revoke execute on function public.post_text_lock_state(uuid) from public, anon, authenticated");
console.log(`\n${total - bad}/${total} ok`); await su.end(); process.exit(bad ? 1 : 0);

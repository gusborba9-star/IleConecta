// Verificação LOCAL da migration 0144 (editar post, ocultar e desativar comentários). Uso: node supabase/verify/verify_0144.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0144";
const { c: su, failed } = await freshDb(name, { with64: true, max: 143 });
ok("migrations 0001–0143 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated, service_role; grant select on storage.objects to anon;`);
const mig = readFileSync(new URL("../migrations/0144_editar_post_e_moderar_comentarios.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0144 aplica e reaplica sem erro", e === null, e ?? "");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0144000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, t = "casa") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set display_name=excluded.display_name", [id, t, nm]); };
const O1 = uuid(1), H1 = uuid(11), O2 = uuid(2), H2 = uuid(12), C1 = uuid(21), C2 = uuid(22);
await mk(O1, "Casa 1"); await mk(O2, "Casa 2"); await mk(C1, "Cliente 1", "cliente"); await mk(C2, "Cliente 2", "cliente");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa 1','casa-1','maximo'),($3,$4,'Casa 2','casa-2','maximo')", [H1, O1, H2, O2]);
const post = async (h, content = "Axé") => (await sv("insert into posts(house_id,kind,content) values ($1,'geral',$2) returning id", [h, content])).rows[0].id;
const comment = async (p, u, t = "Lindo") => (await sv("insert into post_comments(post_id,user_id,text) values ($1,$2,$3) returning id", [p, u, t])).rows[0].id;
const promo = async (h, p, status) => su.query("insert into promotions(house_id,kind,scope,item_type,item_id,days,amount_cents,authorized_at,status) values ($1,'boost','cidade','post',$2,3,1000,now(),$3)", [h, p, status]);
const upd = (uid, id, set, p = []) => as(uid, (c) => q(c, `update posts set ${set} where id=$1`, [id, ...p]));
const row = async (id) => (await sv("select content, edited_at, comments_off, kind, house_id, created_at from posts where id=$1", [id])).rows[0];

// ---- editar texto
let P = await post(H1); let r = await upd(O1, P, "content='Texto novo'");
let w = await row(P);
ok("a casa edita o texto do próprio post", !r.err && r.n === 1 && w.content === "Texto novo", r.err);
ok("…e o post passa a ter 'editado em'", w.edited_at !== null);
const before = (await row(P)).edited_at; r = await upd(O1, P, "comments_off=true");
ok("mexer em outra coisa não muda o 'editado em'", !r.err && String((await row(P)).edited_at) === String(before));
r = await upd(O1, P, "content='Texto novo'");
ok("regravar o mesmo texto não conta como edição", String((await row(P)).edited_at) === String(before));
r = await upd(O1, P, "edited_at=null"); ok("a casa não consegue apagar o 'editado' na mão", String((await row(P)).edited_at) === String(before));
r = await upd(O1, P, "edited_at='2001-01-01'"); ok("…nem escrever uma data falsa", String((await row(P)).edited_at) === String(before));
r = await upd(O1, P, "content='   '"); ok("texto em branco recusado", /Escreva o texto/.test(r.err ?? ""), r.err);
r = await upd(O1, P, "content=''"); ok("texto vazio recusado (regra do banco)", !!r.err, r.err);
r = await upd(O1, P, "content=repeat('a',2001)"); ok("texto acima de 2000 recusado", !!r.err, r.err);
// plano grátis: contato externo é recusado
const OG = uuid(3), HG = uuid(13); await mk(OG, "Casa Grátis"); await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa G','casa-g','gratis')", [HG, OG]);
const PG = await post(HG); r = await upd(OG, PG, "content='Chame no whatsapp 11 98888-7777 agora'");
ok("casa grátis: contato externo na edição é recusado (moderação ativa)", !!r.err && (await row(PG)).content === "Axé", r.err);
// outra casa e cliente
const PO = await post(H2); r = await upd(O1, PO, "content='invasão'"); ok("outra casa não edita post alheio", r.n === 0 && (await row(PO)).content === "Axé");
r = await upd(C1, PO, "content='invasão'"); ok("cliente não edita post", r.n === 0 && (await row(PO)).content === "Axé");
r = await upd(O1, P, "house_id=$2", [H2]); ok("não dá para mover o post para outra casa", (await row(P)).house_id === H1, r.err);
r = await upd(O1, P, "created_at='2001-01-01'"); ok("não dá para mudar a data de publicação", String((await row(P)).created_at) !== String(new Date("2001-01-01")));
r = await upd(O1, P, "kind='story'"); ok("não dá para mudar o tipo", (await row(P)).kind === "geral");
r = await q(su, "update posts set content='feito pela administração' where id=$1", [P]); ok("SQL da administração edita sem a trava", !r.err && (await row(P)).content === "feito pela administração");

// ---- impulsionado: só o texto
const putObj = (owner, f) => su.query("insert into storage.objects(bucket_id,name,owner) values ('post-images',$1,$2) on conflict do nothing", [`${owner}/${f}`, owner]).catch(() => su.query("insert into storage.objects(bucket_id,name) values ('post-images',$1)", [`${owner}/${f}`]));
await su.query("insert into storage.buckets(id,name,public) values ('post-images','post-images',true) on conflict do nothing").catch(() => {});
await putObj(O1, "a.jpg"); await putObj(O1, "b.jpg");
const styled = async () => (await sv("insert into posts(house_id,kind,content,card_style,card_image_path,card_rights_ack) values ($1,'geral','No card','total',$2,true) returning id", [H1, `${O1}/a.jpg`])).rows[0].id;
const PB = await styled(); await promo(H1, PB, "ativa");
r = await upd(PB === null ? O1 : O1, PB, "content='Texto mudou'"); ok("impulsionado ativo: o texto pode mudar", !r.err && (await row(PB)).content === "Texto mudou", r.err);
for (const [lbl, set] of [["trocar a imagem", `card_image_path='${O1}/b.jpg'`], ["mudar o estilo", "card_style='parcial'"], ["tirar o estilo", "card_style=null"], ["mudar a fonte", "card_font='serif'"], ["mudar o fundo", "card_scrim=80"], ["mudar a cor", "card_color='branco'"], ["tirar a confirmação de direitos", "card_rights_ack=false"], ["mudar o negrito", "card_bold=true"]]) {
  const res = await upd(O1, PB, set);
  ok(`impulsionado ativo: ${lbl} é recusado com mensagem clara`, /só o texto pode ser editado/.test(res.err ?? ""), res.err);
}
const PW = await styled(); await promo(H1, PW, "aguardando"); r = await upd(O1, PW, "card_style='parcial'");
ok("impulsionado aguardando: estilo também travado", /só o texto/.test(r.err ?? ""), r.err);
const PE = await styled(); await promo(H1, PE, "encerrada"); r = await upd(O1, PE, "card_style='parcial'");
ok("impulsionamento encerrado libera o estilo", !r.err && r.n === 1, r.err);
const PN = await styled(); r = await upd(O1, PN, "card_image_path=null, card_style=null, card_rights_ack=false");
ok("sem impulsionamento a casa pode tirar o estilo", !r.err && r.n === 1, r.err);
r = await upd(O1, PB, "content=repeat('a',401)"); ok("post com card: limite de 400 continua na edição", /400/.test(r.err ?? ""), r.err);

// ---- comentários desativados
const PC = await post(H1); const c0 = await comment(PC, C1, "Antes de desativar");
r = await upd(O1, PC, "comments_off=true"); ok("a casa desativa os comentários", !r.err && (await row(PC)).comments_off === true);
r = await as(C2, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,'novo')", [PC, C2]));
ok("com comentários desativados o cliente não comenta", /desativados/.test(r.err ?? ""), r.err);
r = await as(O2, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,'outra casa')", [PC, O2]));
ok("…nem outra casa", /desativados/.test(r.err ?? ""), r.err);
r = await as(O1, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,'a casa responde')", [PC, O1]));
ok("a própria casa ainda pode comentar", !r.err && r.n === 1, r.err);
ok("os comentários antigos continuam visíveis", (await as(C2, (c) => q(c, "select id from post_comments where id=$1", [c0]))).rows?.length === 1);
r = await upd(O1, PC, "comments_off=false"); r = await as(C2, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,'agora pode')", [PC, C2]));
ok("reativar volta a permitir", !r.err && r.n === 1, r.err);
r = await upd(O2, PC, "comments_off=true"); ok("outra casa não desativa comentários alheios", r.n === 0 && (await row(PC)).comments_off === false);
r = await upd(C1, PC, "comments_off=true"); ok("cliente não desativa comentários", r.n === 0);

// ---- ocultar comentário
const PH = await post(H1); const cA = await comment(PH, C1, "Comentário do cliente 1"); const cB = await comment(PH, C2, "Comentário do cliente 2");
const vis = (uid, id) => as(uid, async (c) => (await q(c, "select id from post_comments where id=$1", [id])).rows?.length === 1);
const hide = (uid, id, h) => as(uid, (c) => q(c, "select public.house_set_comment_hidden($1,$2)", [id, h]));
r = await hide(O1, cA, true); ok("a casa oculta um comentário", !r.err, r.err);
ok("oculto: a dona da casa ainda vê", await vis(O1, cA));
ok("oculto: quem escreveu ainda vê o próprio", await vis(C1, cA));
ok("oculto: outro cliente NÃO vê", !(await vis(C2, cA)));
ok("oculto: visitante (anon) NÃO vê", (await (async () => { const c = await connect(name); try { await c.query("set role anon"); return (await q(c, "select id from post_comments where id=$1", [cA])).rows?.length === 0; } finally { await c.end(); } })()));
ok("oculto: outra casa NÃO vê", !(await vis(O2, cA)));
ok("ocultar não apaga (o registro segue no banco)", (await sv("select count(*)::int n from post_comments where id=$1", [cA])).rows[0].n === 1);
ok("o outro comentário segue visível para todos", await vis(C1, cB) && await vis(C2, cB));
r = await hide(O1, cA, false); ok("a casa mostra de novo", !r.err && await vis(C2, cA), r.err);
r = await hide(O2, cB, true); ok("outra casa não oculta comentário alheio", /sua casa/.test(r.err ?? "") && await vis(C1, cB), r.err);
r = await hide(C1, cB, true); ok("cliente não oculta comentário", /sua casa/.test(r.err ?? "") && await vis(C1, cB), r.err);
r = await hide(C2, cB, true); ok("nem o autor oculta o próprio por aqui (para isso há excluir)", /sua casa/.test(r.err ?? ""), r.err);
r = await hide(O1, uuid(999), true); ok("comentário inexistente: recusado sem vazar nada", /sua casa/.test(r.err ?? ""), r.err);
r = await hide(O1, cB, null); ok("valor nulo recusado", /Informe/.test(r.err ?? ""), r.err);
r = await as(null, (c) => q(c, "select public.house_set_comment_hidden($1,true)", [cB])); ok("sem login: recusado", !!r.err, r.err);
// ninguém consegue se esconder/forçar por escrita direta
r = await as(C1, (c) => q(c, "update post_comments set hidden_by_house=true where id=$1", [cB])); ok("cliente não altera comentário por escrita direta", r.n === 0 || !!r.err);
r = await as(O1, (c) => q(c, "update post_comments set hidden_by_house=true where id=$1", [cB])); ok("nem a casa por escrita direta (só pela função)", r.n === 0 || !!r.err);
r = await as(C2, (c) => q(c, "insert into post_comments(post_id,user_id,text,hidden_by_house) values ($1,$2,'quer nascer oculto',true) returning hidden_by_house", [PH, C2]));
ok("comentário não nasce oculto mesmo se pedir", r.rows?.[0]?.hidden_by_house === false, r.err);
// aviso e contagem
ok("ocultar não gera aviso novo para a casa", (await sv("select count(*)::int n from notifications where user_id=$1 and text ilike '%ocult%'", [O1])).rows[0].n === 0);
// excluir post leva os comentários (inclusive ocultos)
await hide(O1, cA, true); await as(O1, (c) => q(c, "delete from posts where id=$1", [PH]));
ok("excluir o post leva os comentários, ocultos também", (await sv("select count(*)::int n from post_comments where post_id=$1", [PH])).rows[0].n === 0);
// autor exclui o próprio comentário oculto
const PH2 = await post(H1); const cD = await comment(PH2, C1, "para apagar"); await hide(O1, cD, true);
r = await as(C1, (c) => q(c, "delete from post_comments where id=$1", [cD])); ok("autor ainda exclui o próprio comentário oculto", r.n === 1, r.err);

// ---- forma
const acl = await sv(`select has_function_privilege('anon','public.house_set_comment_hidden(uuid,boolean)','execute') a,
  has_function_privilege('authenticated','public.house_set_comment_hidden(uuid,boolean)','execute') u,
  has_function_privilege('authenticated','public.posts_edit_guard()','execute') g1,
  has_function_privilege('authenticated','public.post_comments_guard()','execute') g2,
  (select bool_and(prosecdef) from pg_proc where proname in ('house_set_comment_hidden','posts_edit_guard','post_comments_guard')) d,
  (select bool_and(coalesce(proconfig::text,'') like '%search_path=public%') from pg_proc where proname in ('house_set_comment_hidden','posts_edit_guard','post_comments_guard')) c`);
ok("ACL: função só para logados; gatilhos não chamáveis; security definer com search_path fixo", !acl.rows[0].a && acl.rows[0].u && !acl.rows[0].g1 && !acl.rows[0].g2 && acl.rows[0].d && acl.rows[0].c);

// ---- mutações: cada trava, removida, deixaria passar (o teste detecta)
const PM = await styled(); await promo(H1, PM, "ativa");
await su.query("drop trigger posts_edit_guard on posts");
r = await upd(O1, PM, "card_style='parcial'"); ok("MUTAÇÃO: sem posts_edit_guard o estilo mudaria no impulsionado", !r.err && r.n === 1);
r = await upd(O1, P, "edited_at=null"); ok("MUTAÇÃO: sem posts_edit_guard o 'editado' seria falsificável (houve edição antes)", !r.err);
await su.query("drop trigger trg_post_comments_guard on post_comments");
const rr = await upd(O1, PC, "comments_off=true"); r = await as(C2, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,'furou2')", [PC, C2]));
ok("MUTAÇÃO: sem o gatilho de comentários o cliente comentaria com comentários desativados", !r.err && r.n === 1);
await su.query("drop policy comments_read on post_comments"); await su.query("create policy comments_read on post_comments for select using (true)");
const PX = await post(H1); const cX = await comment(PX, C1, "x"); await hide(O1, cX, true);
ok("MUTAÇÃO (política antiga): comentário oculto apareceria para outro cliente", await vis(C2, cX));
await su.query(mig);
const PR = await styled(); await promo(H1, PR, "ativa"); r = await upd(O1, PR, "card_style='parcial'");
ok("reaplicar a migration restaura a trava do impulsionado", /só o texto/.test(r.err ?? ""), r.err);
await upd(O1, PC, "comments_off=true"); r = await as(C2, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,'furou3')", [PC, C2]));
ok("…a trava de comentários desativados", /desativados/.test(r.err ?? ""), r.err);
ok("…e a privacidade do comentário oculto", !(await vis(C2, cX)) && await vis(C1, cX) && await vis(O1, cX));
console.log(`\n${total - bad}/${total} ok`); await su.end(); process.exit(bad ? 1 : 0);

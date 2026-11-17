// Mede, no banco LOCAL "carga", o tempo das consultas que o app faz. Uso: node scripts/carga/medir.mjs
import { connect } from "../../supabase/verify/pgbase.mjs";
const su = await connect("carga");
const q1 = async (sql, p) => (await su.query(sql, p)).rows;
const as = async (uid, fn) => { const c = await connect("carga"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const out = [];
async function med(nome, uid, sql, params = [], n = 15) {
  return as(uid, async (c) => {
    const t = []; let bytes = 0, rows = 0, err = null;
    for (let i = 0; i < n + 2; i++) { const t0 = performance.now(); try { const r = await c.query(sql, params); if (i >= 2) { t.push(performance.now() - t0); bytes = Buffer.byteLength(JSON.stringify(r.rows)); rows = r.rowCount; } } catch (e) { err = e.message; break; } }
    const o = err ? { nome, erro: err.slice(0, 120) } : { nome, p50: +pct(t, .5).toFixed(1), p95: +pct(t, .95).toFixed(1), kb: Math.round(bytes / 1024), linhas: rows };
    out.push(o); console.log(err ? `ERRO ${nome}: ${o.erro}` : `${nome.padEnd(46)} p50 ${String(o.p50).padStart(7)} ms   p95 ${String(o.p95).padStart(7)} ms   ${String(o.kb).padStart(5)} KB  ${rows} linhas`);
  });
}
// personagens
const cliente = (await q1(`select follower_id id from follows group by 1 order by count(*) desc limit 1`))[0].id;
const [grande] = await q1(`select h.id hid, h.owner_id oid from houses h join house_members m on m.house_id=h.id group by 1,2 order by count(*) desc limit 1`);
const [media] = await q1(`select h.id hid, h.owner_id oid from houses h join house_members m on m.house_id=h.id group by 1,2 order by count(*) offset 100 limit 1`);
console.log("casa grande:", (await q1(`select count(*)::int n from house_members where house_id=$1`, [grande.hid]))[0].n, "membros | casa média:", (await q1(`select count(*)::int n from house_members where house_id=$1`, [media.hid]))[0].n, "membros\n");
await su.query(`insert into admins(user_id) values ($1) on conflict do nothing`, [cliente]).catch(() => {});
const memb = (await q1(`select user_id id from house_members where house_id=$1 and user_id is not null limit 1`, [grande.hid]))[0].id;

const FEED = `select p.id, p.house_id, p.kind, p.content, p.created_at,
  (select to_jsonb(h) from (select owner_id from houses h where h.id=p.house_id) h) houses,
  coalesce((select jsonb_agg(jsonb_build_object('user_id',l.user_id)) from post_likes l where l.post_id=p.id),'[]') post_likes,
  coalesce((select jsonb_agg(to_jsonb(cc)) from (select c.id,c.user_id,c.text,c.created_at,c.hidden_by_house,(select to_jsonb(pr) from (select display_name,avatar_url,account_type,city,state from profiles pr where pr.id=c.user_id) pr) profiles from post_comments c where c.post_id=p.id) cc),'[]') post_comments
 from posts p order by p.created_at desc limit 50`;
console.log("== TELAS DO CLIENTE (um usuário) ==");
await med("Feed (50 posts, curtidas e comentários)", cliente, FEED);
await med("Contagem de curtidas dos 50 posts", cliente, `select * from post_like_counts((select array_agg(id) from (select id from posts order by created_at desc limit 50) x))`);
await med("Lista de casas (200) + perfis", cliente, `select h.id, h.owner_id, h.name, h.category, h.tags, h.cover_url, h.verified, (select to_jsonb(p) from (select avatar_url,bio,city,state,country,created_at from profiles p where p.id=h.owner_id) p) profiles from houses h order by h.created_at desc limit 200`);
await med("Resumo de seguidores (house_follow_summary)", cliente, `select public.house_follow_summary()`);
await med("Casas ocultas da vitrine", cliente, `select public.vitrine_hidden_house_ids()`);
await med("Minhas conversas", cliente, `select * from my_conversations()`);
await med("Mensagens de uma conversa (200)", cliente, `select id,sender_id,text,read,created_at from messages where conversation_id=(select conversation_id from conversation_members where user_id=auth.uid() limit 1) order by created_at limit 200`);
await med("Avisos (30 últimos)", cliente, `select id,text,href,read,created_at from notifications order by created_at desc limit 30`);
await med("Presença (touch_presence)", cliente, `select public.touch_presence()`, [], 30);
await med("Marcar como entregue (mark_delivered)", cliente, `select public.mark_delivered()`, [], 30);
console.log("\n== PAINEL DA CASA GRANDE (dono) ==");
for (const [rot, h] of [["grande", grande], ["média", media]]) {
  await med(`Pessoas da casa — ${rot}`, h.oid, `select * from house_people('todos', null, 50)`);
  await med(`Indicadores da casa 30 dias — ${rot}`, h.oid, `select public.house_indicators(30)`);
  await med(`Central de pendências — ${rot}`, h.oid, `select public.house_pending_center()`);
  await med(`Minhas promoções — ${rot}`, h.oid, `select public.my_promotions()`);
  await med(`Travas de texto dos posts — ${rot}`, h.oid, `select * from my_post_text_locks()`);
  await med(`Exclusão de posts — ${rot}`, h.oid, `select * from my_post_delete_states()`);
}
console.log("\n== ADMINISTRAÇÃO ==");
await med("Indicadores da administração 30 dias", cliente, `select public.admin_indicators(30)`);
// post muito curtido: uma casa grande com 1.000 curtidas e 300 comentários em cada um dos 10 posts mais novos
console.log("\n== FEED COM POSTS MUITO CURTIDOS (10 posts com 3.000 curtidas e 300 comentários) ==");
await su.query(`set session_replication_role = replica`);
await su.query(`with t as (select id from posts where house_id=$1 order by created_at desc limit 10) update posts set created_at = now() - random()*interval '1 hour' where id in (select id from t)`, [grande.hid]);
await su.query(`insert into post_likes(post_id,user_id) select p.id, u.id from (select id from posts where house_id=$1 order by created_at desc limit 10) p cross join lateral (select id from profiles where account_type='cliente' order by random() limit 3000) u on conflict do nothing`, [grande.hid]);
await su.query(`insert into post_comments(post_id,user_id,text) select p.id, u.id, 'Comentário muito curtido '||g from (select id from posts where house_id=$1 order by created_at desc limit 10) p cross join generate_series(1,300) g cross join lateral (select id from profiles where account_type='cliente' order by random() limit 1) u`, [grande.hid]);
await su.query(`reset session_replication_role; analyze post_likes; analyze post_comments`);
await med("Feed com posts muito curtidos", cliente, FEED);
await su.end();
console.log("\n" + JSON.stringify(out));

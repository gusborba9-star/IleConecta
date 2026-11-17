// Simula várias pessoas usando o app ao mesmo tempo no banco LOCAL "carga". Uso: node scripts/carga/simultaneo.mjs [conexoes=40] [segundos=40]
import pg from "pg";
import { connect } from "../../supabase/verify/pgbase.mjs";
const W = Number(process.argv[2] ?? 40), SECS = Number(process.argv[3] ?? 40);
const su = await connect("carga");
const clientes = (await su.query(`select id from profiles where account_type='cliente' order by random() limit 3000`)).rows.map((r) => r.id);
const donos = (await su.query(`select owner_id id from houses order by random()`)).rows.map((r) => r.id);
const withConv = (await su.query(`select distinct user_id id from conversation_members where user_id = any($1::uuid[]) limit 1500`, [clientes])).rows.map((r) => r.id);
const posts = (await su.query(`select id from posts order by random() limit 800`)).rows.map((r) => r.id);
await su.end();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FEED = `select p.id, p.house_id, p.kind, p.content, p.created_at,
  (select to_jsonb(h) from (select owner_id from houses h where h.id=p.house_id) h) houses,
  coalesce((select jsonb_agg(jsonb_build_object('user_id',l.user_id)) from post_likes l where l.post_id=p.id),'[]') post_likes,
  coalesce((select jsonb_agg(to_jsonb(cc)) from (select c.id,c.user_id,c.text,c.created_at,c.hidden_by_house,(select to_jsonb(pr) from (select display_name,avatar_url,account_type,city,state from profiles pr where pr.id=c.user_id) pr) profiles from post_comments c where c.post_id=p.id) cc),'[]') post_comments
 from posts p order by p.created_at desc limit 50`;
const ops = [
  [30, "feed", async (c, u) => { const r = await c.query(FEED); await c.query(`select * from post_like_counts($1::uuid[])`, [r.rows.map((x) => x.id)]); }, "c"],
  [12, "casas", async (c) => { await c.query(`select h.id,h.owner_id,h.name,h.category,h.tags,h.cover_url,h.verified,(select to_jsonb(p) from (select avatar_url,bio,city,state,country,created_at from profiles p where p.id=h.owner_id) p) profiles from houses h order by h.created_at desc limit 200`); await c.query(`select public.house_follow_summary()`); await c.query(`select public.vitrine_hidden_house_ids()`); }, "c"],
  [14, "abrir conversa", async (c) => { await c.query(`select * from my_conversations()`); await c.query(`select id,sender_id,text,read,created_at from messages where conversation_id=(select conversation_id from conversation_members where user_id=auth.uid() limit 1) order by created_at limit 200`); }, "m"],
  [8, "enviar mensagem", async (c) => { await c.query(`insert into messages(conversation_id,sender_id,text) select conversation_id, auth.uid(), 'oi' from conversation_members where user_id=auth.uid() limit 1`); }, "m"],
  [16, "presença", async (c) => { await c.query(`select public.touch_presence()`); }, "c"],
  [4, "avisos", async (c) => { await c.query(`select id,text,href,read,created_at from notifications order by created_at desc limit 30`); }, "c"],
  [6, "curtir", async (c) => { await c.query(`insert into post_likes(post_id,user_id) values ($1, auth.uid()) on conflict do nothing`, [pick(posts)]); }, "c"],
  [3, "comentar", async (c) => { await c.query(`insert into post_comments(post_id,user_id,text) values ($1, auth.uid(), 'Axé!')`, [pick(posts)]); }, "c"],
  [7, "painel da casa", async (c) => { await c.query(`select * from house_people('todos', null, 50)`); await c.query(`select public.house_indicators(30)`); await c.query(`select public.house_pending_center()`); }, "d"],
];
const total = ops.reduce((a, o) => a + o[0], 0);
const choose = () => { let r = Math.random() * total; for (const o of ops) { r -= o[0]; if (r <= 0) return o; } return ops[0]; };
const lat = {}; let errs = {}; let n = 0; const t0 = Date.now(); const end = t0 + SECS * 1000;
async function worker() {
  const c = new pg.Client({ host: "127.0.0.1", port: 5544, user: "postgres", database: "carga" }); await c.connect(); await c.query("set role authenticated");
  while (Date.now() < end) {
    const [, nome, fn, who] = choose();
    const uid = who === "d" ? pick(donos) : who === "m" ? pick(withConv) : pick(clientes);
    await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]);
    const s = performance.now();
    try { await fn(c, uid); (lat[nome] ??= []).push(performance.now() - s); n++; } catch (e) { errs[nome + ": " + e.message.slice(0, 60)] = (errs[nome + ": " + e.message.slice(0, 60)] ?? 0) + 1; }
  }
  await c.end();
}
await Promise.all(Array.from({ length: W }, worker));
const el = (Date.now() - t0) / 1000;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`\n${W} conexões simultâneas por ${el.toFixed(0)} s: ${n} operações = ${(n / el).toFixed(0)} operações/s\n`);
for (const [nome, a] of Object.entries(lat)) console.log(`${nome.padEnd(16)} ${String(a.length).padStart(6)} ops   p50 ${pct(a, .5).toFixed(0).padStart(5)} ms   p95 ${pct(a, .95).toFixed(0).padStart(5)} ms   p99 ${pct(a, .99).toFixed(0).padStart(5)} ms`);
console.log("erros:", JSON.stringify(errs));

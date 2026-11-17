// Corrida pela última vaga no banco LOCAL "carga": muitas pessoas reservam o mesmo ritual ao mesmo tempo. Uso: node scripts/carga/reservas.mjs [pessoas=300] [vagas=10]
// Cria um ritual gratuito de teste e o apaga no fim. Nada pode passar do número de vagas, e ninguém pode ficar com duas vagas.
import { connect } from "../../supabase/verify/pgbase.mjs";
const N = Number(process.argv[2] ?? 300), SEATS = Number(process.argv[3] ?? 10);
const su = await connect("carga");
const q = (c, sql, p) => c.query(sql, p);
const house = (await q(su, "select h.id, h.owner_id from houses h order by random() limit 1")).rows[0];
const ev = (await q(su, `insert into events(house_id,title,price_cents,seats_total,starts_at,description,duration_min,status)
  values ($1,'Ritual da corrida',5000,$2, now()+interval '3 days','Ritual criado só para medir a corrida pela última vaga.',120,'publicado') returning id`, [house.id, SEATS])).rows[0].id;
const people = (await q(su, "select id from profiles where account_type='cliente' and id <> $1 order by random() limit $2", [house.owner_id, N])).rows.map((r) => r.id);
const as = async (uid) => { const c = await connect("carga"); await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return c; };
const conns = await Promise.all(people.map(as));
const t = performance.now();
const results = await Promise.all(conns.map(async (c) => { try { await q(c, "select reserve_event($1) r", [ev]); return "reservou"; } catch (e) { return e.message; } }));
const ms = Math.round(performance.now() - t);
const tally = {}; for (const r of results) tally[r] = (tally[r] ?? 0) + 1;
const conf = (await q(su, "select count(*)::int n, count(distinct user_id)::int u from reservations where event_id=$1 and status in ('confirmada','aguardando_pagamento')", [ev])).rows[0];
const taken = (await q(su, "select event_taken($1)::int n", [ev])).rows[0].n;

// duplo clique: a mesma pessoa pede a mesma vaga 15 vezes ao mesmo tempo num ritual com vagas de sobra
const ev2 = (await q(su, `insert into events(house_id,title,price_cents,seats_total,starts_at,description,duration_min,status)
  values ($1,'Ritual do duplo clique',5000,50, now()+interval '3 days','Ritual criado só para medir o duplo clique de uma pessoa.',120,'publicado') returning id`, [house.id])).rows[0].id;
const one = await Promise.all(Array.from({ length: 15 }, () => as(people[0])));
const r2 = await Promise.all(one.map(async (c) => { try { await q(c, "select reserve_event($1) r", [ev2]); return "reservou"; } catch (e) { return e.message; } }));
const tally2 = {}; for (const r of r2) tally2[r] = (tally2[r] ?? 0) + 1;
const dup = (await q(su, "select count(*)::int n from reservations where event_id=$1 and user_id=$2 and status in ('confirmada','aguardando_pagamento')", [ev2, people[0]])).rows[0].n;

console.log(JSON.stringify({ pessoas: N, vagas: SEATS, ms, resultados: tally, reservas_ativas: conf.n, pessoas_distintas: conf.u, vagas_ocupadas_segundo_o_banco: taken, passou_do_limite: conf.n > SEATS,
  duplo_clique: { tentativas: 15, resultados: tally2, reservas_da_mesma_pessoa: dup } }, null, 1));
for (const e of [ev, ev2]) { await q(su, "delete from reservations where event_id=$1", [e]); await q(su, "delete from events where id=$1", [e]); }
for (const c of [...conns, ...one]) await c.end();
await su.end();

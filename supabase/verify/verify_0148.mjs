// Verificação LOCAL da migration 0148 (índice do feed + avisos de atualização). Uso: node supabase/verify/verify_0148.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0148";
const { c: su, failed } = await freshDb(name, { with64: true, max: 147 });
ok("migrations 0001–0147 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0148_escala_feed_e_avisos_de_atualizacao.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0148 aplica e reaplica sem erro", e === null, e ?? "");
// o app não pode ler/escrever fora da própria linha: a migration só dá select; refaz os grants do harness como na produção
await su.query(`revoke all on public.live_pings from authenticated, anon; grant select on public.live_pings to authenticated;
  revoke execute on function public.live_ping(uuid[],text), public.live_ping_messages(), public.live_ping_orders(), public.live_ping_reservations(), public.live_ping_refunds() from public, anon, authenticated;`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const U = (n) => `a0148000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const mkUser = async (n, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city,state,country) values ($1,$2,$3,'Salvador','BA','BR') on conflict (id) do update set account_type=$2", [U(n), type, `Pessoa ${n}`]); };
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) await mkUser(n, n <= 2 ? "casa" : "cliente");
const H1 = "b0148000-0000-0000-0000-000000000001", H2 = "b0148000-0000-0000-0000-000000000002";
await sv("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa 1','casa-1','maximo'),($3,$4,'Casa 2','casa-2','maximo')", [H1, U(1), H2, U(2)]);
await sv("insert into house_staff(house_id,user_id,name,active) values ($1,$2,'Equipe',true),($1,$3,'Ex-equipe',false)", [H1, U(7), U(8)]);
await sv("insert into admins(user_id) values ($1)", [U(6)]);
const pings = async () => (await sv("select user_id, topic from live_pings order by 1,2")).rows.map((r) => `${r.user_id.slice(-2)}:${r.topic}`);
const reset = () => sv("truncate live_pings");

// ---- índice do feed
const ix = await sv("select indexdef from pg_indexes where indexname='posts_created_idx'");
ok("índice do feed existe (created_at desc)", ix.rows.length === 1 && /created_at DESC/.test(ix.rows[0].indexdef), ix.rows[0]?.indexdef);
await sv("insert into posts(house_id,kind,content,created_at) select $1,'geral','x'||g, now()-g*interval '1 minute' from generate_series(1,3000) g", [H1]);
await sv("analyze posts");
const pl = await as(U(3), (c) => q(c, "explain select id from posts order by created_at desc limit 50"));
ok("o feed usa o índice (sem varrer e ordenar tudo)", pl.rows?.some((r) => /posts_created_idx/.test(r["QUERY PLAN"])) && !pl.rows?.some((r) => /Seq Scan on posts/.test(r["QUERY PLAN"])), pl.rows?.map((r) => r["QUERY PLAN"]).join(" | "));

// ---- mensagens
const conv = (await sv("insert into conversations default values returning id")).rows[0].id;
await sv("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [conv, U(3), U(1)]);
await reset();
const ins = await sv("insert into messages(conversation_id,sender_id,text) values ($1,$2,'oi')", [conv, U(3)]);
ok("mensagem nova insere normalmente", !ins.err, ins.err);
ok("mensagem nova avisa só os dois participantes", JSON.stringify(await pings()) === JSON.stringify([`01:messages`, `03:messages`]), JSON.stringify(await pings()));
await reset();
await sv("insert into messages(conversation_id,sender_id,text) select $1,$2,'m'||g from generate_series(1,50) g", [conv, U(1)]);
ok("50 mensagens de uma vez geram só 1 aviso por pessoa", (await pings()).length === 2);
await reset();
await sv("update messages set read=true where conversation_id=$1", [conv]);
ok("marcar como lida avisa os participantes (recibo ✓✓)", (await pings()).length === 2);
const conv2 = (await sv("insert into conversations default values returning id")).rows[0].id;
await sv("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [conv2, U(4), U(2)]);
await reset();
await sv("insert into messages(conversation_id,sender_id,text) values ($1,$2,'outra')", [conv2, U(4)]);
ok("conversa de outras pessoas não avisa quem não participa", !(await pings()).some((p) => /^(01|03|05):/.test(p)), JSON.stringify(await pings()));

// ---- pedidos de serviço
const S1 = (await sv("insert into services(house_id,kind,title,description,price_cents,active,bookable) values ($1,'buzios','Jogo','Jogo de búzios completo com orientação',9000,true,true) returning id", [H1])).rows[0].id;
await reset();
const o = await sv("insert into service_orders(service_id,house_id,client_id,title,price_cents,status,modality,stages_total) values ($1,$2,$3,'Jogo',9000,'confirmado','distancia',1) returning id", [S1, H1, U(5)]);
ok("pedido novo insere", !o.err, o.err);
ok("pedido avisa cliente, dona e equipe ativa (não a ex-equipe nem outra casa)", JSON.stringify(await pings()) === JSON.stringify(["01:orders", "05:orders", "07:orders"]), JSON.stringify(await pings()));
await reset();
await sv("update service_orders set status='em_andamento' where id=$1", [o.rows[0].id]);
ok("mudança de estado do pedido avisa os mesmos", JSON.stringify(await pings()) === JSON.stringify(["01:orders", "05:orders", "07:orders"]));

// ---- reservas
const evr = await sv("insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Ritual','Ritual de teste com descrição longa',4000,30,now()+interval '3 days','publicado',60) returning id", [H2]); if (evr.err) console.log('ERRO evento:', evr.err); const EV = evr.rows?.[0]?.id;
await reset();
const rs = await sv("insert into reservations(event_id,user_id,status) values ($1,$2,'confirmada') returning id", [EV, U(5)]);
ok("reserva insere", !rs.err, rs.err);
ok("reserva avisa quem reservou e a dona da casa do ritual", JSON.stringify(await pings()) === JSON.stringify(["02:reservations", "05:reservations"]), JSON.stringify(await pings()));

// ---- reembolsos
const pay = (await sv("insert into payments(order_id,provider,provider_ref,gross_cents,status,payment_method) values ($1,'stripe','pi_1',9000,'confirmado','pix') returning id", [o.rows[0].id])).rows[0].id;
await reset();
const rf = await sv("insert into refund_requests(payment_id,order_id,house_id,client_id,kind,amount_cents,status) values ($1,$2,$3,$4,'antes_do_inicio',9000,'pendente') returning id", [pay, o.rows[0].id, H1, U(5)]);
ok("pedido de reembolso insere", !rf.err, rf.err);
ok("reembolso avisa cliente, dona, equipe ativa e administração", JSON.stringify(await pings()) === JSON.stringify(["01:refunds", "05:refunds", "06:refunds", "07:refunds"]), JSON.stringify(await pings()));

// ---- segurança da tabela de avisos
const rd = (uid) => as(uid, (c) => q(c, "select user_id, topic from live_pings"));
const r5 = await rd(U(5));
ok("cada pessoa lê só os próprios avisos", r5.rows.length > 0 && r5.rows.every((r) => r.user_id === U(5)), JSON.stringify(r5.rows));
ok("quem não participou não vê aviso de ninguém", (await rd(U(4))).rows.every((r) => r.user_id === U(4)));
const w1 = await as(U(5), (c) => q(c, "insert into live_pings(user_id,topic) values ($1,'orders')", [U(5)]));
const w2 = await as(U(5), (c) => q(c, "update live_pings set at=now()"));
const w3 = await as(U(5), (c) => q(c, "delete from live_pings"));
ok("o app não consegue gravar, alterar nem apagar avisos", !!w1.err && !!w2.err && !!w3.err, [w1.err, w2.err, w3.err].join(" | "));
const w4 = await as(U(5), (c) => q(c, "select public.live_ping(array[$1::uuid],'orders')", [U(5)]));
ok("o app não chama live_ping direto", !!w4.err, w4.err);
const an = await q((await (async () => { const c = await connect(name); await c.query("set role anon"); return c; })()), "select * from live_pings");
ok("anônimo não lê avisos", !!an.err, an.err);
const bt = await sv("insert into live_pings(user_id,topic) values ($1,'invalido')", [U(5)]);
ok("assunto inválido é recusado", !!bt.err);

// ---- a falha do aviso nunca derruba a operação principal
await sv("alter table live_pings rename to live_pings_x");
const f1 = await sv("insert into messages(conversation_id,sender_id,text) values ($1,$2,'com aviso quebrado')", [conv, U(3)]);
ok("se o aviso falhar, a mensagem ainda é gravada", !f1.err, f1.err);
const f2 = await sv("update service_orders set status='concluido' where id=$1", [o.rows[0].id]);
ok("se o aviso falhar, o pedido ainda muda", !f2.err, f2.err);
await sv("alter table live_pings_x rename to live_pings");

// ---- publicação (tempo real)
await sv("create publication supabase_realtime");
let e2 = null; try { await su.query(mig); } catch (x) { e2 = x.message; }
ok("reaplicar com a publicação presente inclui live_pings", e2 === null && (await sv("select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='live_pings'")).rows.length === 1, e2 ?? "");
// ---- mensagens ainda leem pelas regras de sempre
const m3 = await as(U(3), (c) => q(c, "select count(*)::int n from messages where conversation_id=$1", [conv]));
const m5 = await as(U(5), (c) => q(c, "select count(*)::int n from messages where conversation_id=$1", [conv]));
ok("mensagens: participante lê, estranho não", m3.rows[0].n > 0 && m5.rows[0].n === 0, `${m3.rows[0].n}/${m5.rows[0].n}`);

// ---- 0149: retirar as quatro tabelas do tempo real
const mig2 = readFileSync(new URL("../migrations/0149_retirar_tabelas_do_tempo_real.sql", import.meta.url), "utf8");
await sv("alter publication supabase_realtime add table public.messages, public.service_orders, public.reservations, public.refund_requests");
let e3 = null; try { await su.query(mig2); await su.query(mig2); } catch (x) { e3 = x.message; }
const pubs = (await sv("select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1")).rows.map((r) => r.tablename);
ok("0149 aplica e reaplica; só live_pings fica no tempo real (das 5 tabelas)", e3 === null && JSON.stringify(pubs) === JSON.stringify(["live_pings"]), (e3 ?? "") + JSON.stringify(pubs));
const m6 = await sv("insert into messages(conversation_id,sender_id,text) values ($1,$2,'depois da 0149')", [conv, U(3)]);
ok("depois da 0149 as mensagens continuam gravando e avisando", !m6.err && (await pings()).includes("03:messages"), m6.err ?? "");
console.log(`\n${total - bad}/${total} ok`); await su.end(); process.exit(bad ? 1 : 0);

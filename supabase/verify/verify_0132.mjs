// Verificação LOCAL da migration 0132 (indicadores da casa).
// Uso: node supabase/verify/verify_0132.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0132";
const { c: su, failed } = await freshDb(name, { with64: true, max: 131 });
ok("migrations 0001–0131 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const MIGFILE = process.env.MIG_FILE ?? "0132_indicadores_da_casa.sql";
const mig = readFileSync(new URL(`../migrations/${MIGFILE}`, import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0132 aplica e reaplica sem erro", e0 === null, e0 ?? "");
ok("não cria tabela nova", (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n === tablesBefore);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 160)); return r; };
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
const uuid = (p, i) => `${p}0132000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const T = (h) => `now() - interval '${h} hours'`;
const D = (d) => `now() - interval '${d} days'`;

const O1 = uuid("a", 1), O3 = uuid("a", 3), S1 = uuid("e", 1), NOB = uuid("f", 1);
const C = {}; for (let i = 1; i <= 9; i++) C[i] = uuid("c", i);
const H1 = uuid("d", 1), H3 = uuid("d", 3);
const mk = async (id, t, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(/\W/g, "")}${id.slice(-3)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set account_type=$2, display_name=$3", [id, t, nm]); };
for (const [id, t, nm] of [[O1, "casa", "Dona Um"], [O3, "casa", "Dona Tres"], [S1, "cliente", "Equipe"], [NOB, "cliente", "Sem Casa"]]) await mk(id, t, nm);
for (let i = 1; i <= 9; i++) await mk(C[i], "cliente", `Cliente${i}`);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','maximo'),($3,$4,'Casa Tres','casa-tres','maximo')", [H1, O1, H3, O3]);
await su.query("insert into house_staff(house_id,user_id,name,active,perms) values ($1,$2,'Equipe',true,'{stats}')", [H1, S1]);
const setPerms = (p) => su.query("update house_staff set perms=$1 where house_id=$2", [p, H1]);

const ind = (uid, days) => as(uid, (c) => q(c, "select public.house_indicators($1) r", [days === undefined ? 30 : days]));
const get = async (uid, days) => { const r = await ind(uid, days); if (r.err) throw new Error(r.err); return r.rows[0].r; };
const M = (v, k) => v.metrics[k];

// ---- acesso
const anon = await as(null, (c) => q(c, "select public.house_indicators(30) r"), "anon");
const nh = await ind(NOB), cl = await ind(C[1]);
ok("visitante sem login não consulta", !!anon.err, anon.err);
ok("pessoa sem casa e cliente comum não consultam", /not_house/.test(nh.err ?? "") && /not_house/.test(cl.err ?? ""));
const acl = await sv(`select has_function_privilege('anon','public.house_indicators(integer)','execute') a, has_function_privilege('public','public.house_indicators(integer)','execute') p, has_function_privilege('authenticated','public.house_indicators(integer)','execute') u`);
ok("ACL: anon e public sem execute; logado com execute", !acl.rows[0].a && !acl.rows[0].p && acl.rows[0].u);
let v = await get(O1);
ok("casa sem nada: tudo zero, sem erro; tempo de resposta e ocupação vazios", M(v, "pedidos_criados").current === 0 && M(v, "volume_cents").current === 0 && M(v, "tempo_resposta_min").current === null && v.snapshot.ocupacao_pct === null && v.snapshot.seguidores_total === 0 && v.role === "titular" && v.days === 30, JSON.stringify(v).slice(0, 300));

// ---- seguidores
const fol = (u, h, ago) => force(`insert into follows(follower_id,house_id,created_at) values ($1,$2,${ago})`, [u, h]);
await fol(C[1], H1, D(5)); await fol(C[2], H1, D(10)); await fol(C[3], H1, D(20)); await fol(C[4], H1, D(40)); await fol(C[5], H1, D(50)); await fol(C[6], H1, D(100)); await fol(C[1], H3, D(5));

// ---- conversas
const conv = async (owner, other) => { const id = (await su.query("insert into conversations default values returning id")).rows[0].id; await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [id, owner, other]); return id; };
const msg = (cid, sender, ago, asst = false) => force(`insert into messages(conversation_id,sender_id,text,created_at,from_assistant) values ($1,$2,'oi',${ago},${asst})`, [cid, sender]);
const K1 = await conv(O1, C[1]); await msg(K1, C[1], T(48)); await msg(K1, O1, T(47)); await msg(K1, C[1], T(10)); await msg(K1, C[1], T(9)); await msg(K1, O1, T(8));
const K2 = await conv(O1, C[2]); await msg(K2, C[2], T(100)); await msg(K2, O1, T(98));
const K3 = await conv(O1, C[3]); await msg(K3, C[3], T(30));
const K4 = await conv(O1, C[4]); await msg(K4, C[4], T(60)); await msg(K4, O1, `now() - interval '59 hours 40 minutes'`, true);
const K5 = await conv(O1, C[5]); await msg(K5, C[5], D(40)); await msg(K5, O1, `now() - interval '40 days' + interval '30 minutes'`);
const K9 = await conv(O3, C[1]); await msg(K9, C[1], T(5)); await msg(K9, O3, T(4));       // OUTRA casa
v = await get(O1);
ok("novos seguidores: 3 no período, 2 no anterior; total 6; seguidor de outra casa não conta", M(v, "novos_seguidores").current === 3 && M(v, "novos_seguidores").previous === 2 && v.snapshot.seguidores_total === 6);
ok("pessoas que falaram: 4 (a casa e a assistente não contam); anterior 1", M(v, "pessoas_que_falaram").current === 4 && M(v, "pessoas_que_falaram").previous === 1, JSON.stringify(M(v, "pessoas_que_falaram")));
ok("tempo de resposta: mediana de 60, 120, 120 e 20 min = 90; mensagem logo depois de outra da mesma pessoa (60 min) e conversa sem resposta não contam", Number(M(v, "tempo_resposta_min").current) === 90, JSON.stringify(M(v, "tempo_resposta_min")));
ok("tempo de resposta do período anterior: 30 min", Number(M(v, "tempo_resposta_min").previous) === 30, JSON.stringify(M(v, "tempo_resposta_min")));

// ---- pedidos, reservas, reembolso, avaliações
const ord = async (h, c, st, ago = "now()", price = 5000) => (await force(`insert into service_orders(house_id,client_id,title,price_cents,status,created_at) values ($1,$2,'Trabalho',$3,$4,${ago}) returning id`, [h, c, price, st])).rows[0].id;
const OP1 = await ord(H1, C[1], "concluido"), OP2 = await ord(H1, C[2], "confirmado"), OP3 = await ord(H1, C[3], "em_andamento");
await ord(H1, C[4], "aguardando_pagamento"); await ord(H1, C[5], "cancelado"); await ord(H1, C[5], "expirado"); const OREF = await ord(H1, C[6], "reembolsado");
const OPV1 = await ord(H1, C[1], "concluido", D(40)), OPV2 = await ord(H1, C[7], "concluido", D(45));
await ord(H1, C[8], "reembolsado", D(100));                                                          // C8 já comprou antes (e foi reembolsado): quando voltar, é "voltou"
await ord(H3, C[2], "concluido");                                                                     // OUTRA casa
const ev = async (h, title, startsExpr, status, price = 3000, seats = 10) => (await force(`insert into events(house_id,title,price_cents,seats_total,starts_at,status) values ($1,$2,$3,$4,${startsExpr},$5) returning id`, [h, title, price, seats, status])).rows[0].id;
const E1 = await ev(H1, "Gira", "now() + interval '10 days'", "publicado"), E2 = await ev(H1, "Gira antiga", "now() - interval '35 days'", "publicado"), E3 = await ev(H1, "Rascunho", "now() + interval '5 days'", "rascunho"), E4 = await ev(H1, "Longe", "now() + interval '60 days'", "publicado");
const E5 = await ev(H3, "Gira da outra", "now() + interval '10 days'", "publicado");
const rs = (e, u, st, ago = "now()") => force(`insert into reservations(event_id,user_id,status,created_at) values ($1,$2,$3,${ago})`, [e, u, st]);
await rs(E1, C[1], "confirmada"); await rs(E1, C[8], "confirmada"); await rs(E1, C[9], "cancelada"); await rs(E2, C[7], "confirmada", D(40)); await rs(E5, C[2], "confirmada"); await rs(E1, C[5], "expirada"); await rs(E3, C[3], "confirmada"); await rs(E4, C[4], "confirmada");
const PAY = (await force(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',5000,'confirmado','v2-2026-10',500,now(),'pix') returning id`, [OREF])).rows[0].id;
await force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,$3,$4,'antes_do_inicio','Não recebi o atendimento',5000,'pendente')`, [PAY, OREF, H1, C[6]]);
const rv = (h, u, rating, oid, extra = "", vals = "", ago = "now()") => force(`insert into reviews(house_id,author_id,rating,comment,service_order_id,created_at${extra}) values ($1,$2,$3,'ok',$4,${ago}${vals})`, [h, u, rating, oid]);
await rv(H1, C[1], 5, OP1); await rv(H1, C[2], 4, OP2, ",reply,replied_at", ",'Obrigada',now()"); await rv(H1, C[3], 1, OP3, ",hidden", ",true"); await rv(H1, C[7], 3, OPV2, "", "", D(45));
ok("dados de teste semeados por completo", (await cnt("select count(*)::int n from service_orders")) === 11 && (await cnt("select count(*)::int n from reservations")) === 8 && (await cnt("select count(*)::int n from events")) === 5 && (await cnt("select count(*)::int n from refund_requests")) === 1 && (await cnt("select count(*)::int n from reviews")) === 4 && (await cnt("select count(*)::int n from follows")) === 7 && (await cnt("select count(*)::int n from messages")) === 14, JSON.stringify((await sv("select (select count(*) from messages) m")).rows[0]));
v = await get(O1);
ok("pedidos criados 7, pagos 3, perdidos 2 (cancelado e expirado); o reembolsado só conta como criado", M(v, "pedidos_criados").current === 7 && M(v, "pedidos_pagos").current === 3 && M(v, "pedidos_perdidos").current === 2, JSON.stringify([M(v, "pedidos_criados"), M(v, "pedidos_pagos"), M(v, "pedidos_perdidos")]));
ok("pedidos do período anterior: 2 criados, 2 pagos", M(v, "pedidos_criados").previous === 2 && M(v, "pedidos_pagos").previous === 2 && M(v, "pedidos_perdidos").previous === 0);
ok("reservas: 4 confirmadas, 1 cancelada e 1 vencida no período; anterior 1 confirmada; outra casa e rascunho não distorcem", M(v, "reservas_confirmadas").current === 4 && M(v, "reservas_canceladas").current === 2 && M(v, "reservas_confirmadas").previous === 1, JSON.stringify([M(v, "reservas_confirmadas"), M(v, "reservas_canceladas")]));
ok("volume (titular): 3 pedidos x R$ 50 + 4 vagas x R$ 30 = R$ 270; anterior R$ 130", M(v, "volume_cents").current === 15000 + 12000 && M(v, "volume_cents").previous === 10000 + 3000, JSON.stringify(M(v, "volume_cents")));
ok("clientes no período: C1, C2, C3, C8 e C4 = 5 pessoas distintas (anterior: C1 e C7); voltaram: C1 (pedido anterior) e C8 (pedido reembolsado antes)", M(v, "clientes_no_periodo").current === 5 && M(v, "clientes_no_periodo").previous === 2 && M(v, "clientes_que_voltaram").current === 2, JSON.stringify([M(v, "clientes_no_periodo"), M(v, "clientes_que_voltaram")]));
ok("reembolsos pedidos: 1 agora, 0 antes", M(v, "reembolsos").current === 1 && M(v, "reembolsos").previous === 0);
ok("avaliações visíveis: 2, nota média 4,5 (a escondida não conta); anterior 1 com nota 3", M(v, "avaliacoes").current === 2 && Number(M(v, "nota_media").current) === 4.5 && M(v, "avaliacoes").previous === 1 && Number(M(v, "nota_media").previous) === 3, JSON.stringify([M(v, "avaliacoes"), M(v, "nota_media")]));
ok("avaliações sem resposta: só as visíveis e sem resposta (a do período anterior também)", v.snapshot.avaliacoes_sem_resposta === 2, `${v.snapshot.avaliacoes_sem_resposta}`);
ok("ocupação dos rituais dos próximos 30 dias: só publicados e dentro de 30 dias (Gira: 2 confirmadas de 10 = 20%; rascunho e 60 dias fora)", Number(v.snapshot.ocupacao_pct) === 20, `${v.snapshot.ocupacao_pct}`);

// ---- outras janelas e entradas
const v7 = await get(O1, 7), v90 = await get(O1, 90);
ok("7 dias: 1 novo seguidor (dia 5); 90 dias: 5 (até o dia 50)", M(v7, "novos_seguidores").current === 1 && M(v90, "novos_seguidores").current === 5 && v7.days === 7 && v90.days === 90, `${M(v7, "novos_seguidores").current} ${M(v90, "novos_seguidores").current}`);
for (const bad_ of [0, -5, 999, 31, null]) { const x = await get(O1, bad_); if (x.days !== 30) { ok(`período inválido (${bad_}) volta para 30`, false); } }
ok("período inválido (0, -5, 999, 31, nulo) volta para 30 dias", true);
const hostil = await as(O1, (c) => q(c, "select public.house_indicators('30; drop table houses')"));
ok("texto no lugar do período é recusado", !!hostil.err && (await cnt("select count(*)::int n from houses")) === 2);
const v3 = await get(O3);
ok("outra casa vê só o que é dela", M(v3, "pedidos_criados").current === 1 && M(v3, "novos_seguidores").current === 1 && M(v3, "pessoas_que_falaram").current === 1 && Number(M(v3, "tempo_resposta_min").current) === 60 && M(v3, "reservas_confirmadas").current === 1 && v3.snapshot.seguidores_total === 1, JSON.stringify([M(v3, "pedidos_criados"), M(v3, "tempo_resposta_min")]));

// ---- equipe
const s1 = await get(S1);
ok("equipe com 'indicadores': vê as contagens, sem dinheiro, reembolso nem avaliação", s1.role === "equipe" && M(s1, "pedidos_criados").current === 7 && M(s1, "novos_seguidores").current === 3 && M(s1, "volume_cents").current === null && M(s1, "reembolsos").current === null && M(s1, "avaliacoes").current === null && M(s1, "nota_media").current === null && s1.snapshot.avaliacoes_sem_resposta === null && s1.snapshot.ocupacao_pct !== null, JSON.stringify(s1.metrics.volume_cents));
ok("equipe: nada de dinheiro em lugar nenhum da resposta", !JSON.stringify(s1).includes("15000") && !JSON.stringify(s1).includes("27000"));
for (const perms of [[], ["chat_read"], ["orders"], ["members"], ["post", "calendar"]]) { await setPerms(perms); const e = await ind(S1); if (!/sem_permissao/.test(e.err ?? "")) ok(`equipe com ${perms.join(",") || "nada"} não vê indicadores`, false, e.err); }
ok("equipe sem a permissão de indicadores é recusada (nenhuma outra permissão basta)", true);
await setPerms(["stats"]); await su.query("update house_staff set active=false where house_id=$1", [H1]);
const off = await ind(S1); ok("equipe desativada perde o acesso", /not_house/.test(off.err ?? ""));
await su.query("update house_staff set active=true where house_id=$1", [H1]);

// ---- só leitura e função
const snap = async () => (await sv(`select (select count(*) from messages)::int a, (select count(*) from service_orders)::int b, (select count(*) from reservations)::int c, (select count(*) from follows)::int d, (select count(*) from refund_requests)::int e, (select count(*) from notifications)::int f, (select count(*) from admin_audit)::int g, (select count(*) from reviews)::int h`)).rows[0];
const a1 = await snap(); await get(O1); await get(S1); await get(O3, 90); const a2 = await snap();
ok("consultar não altera nada", JSON.stringify(a1) === JSON.stringify(a2));
const fn = await sv("select provolatile v, prosecdef d, proconfig c from pg_proc where proname='house_indicators'");
ok("função 'stable', security definer, search_path fixo", fn.rows[0].v === "s" && fn.rows[0].d === true && /search_path=public/.test(String(fn.rows[0].c)));

// ---- volume
await su.query("set session_replication_role = replica");
await su.query(`insert into conversations(id) select gen_random_uuid() from generate_series(1,300)`);
await su.query(`create temp table vc as select id, row_number() over () rn from conversations where id not in (select conversation_id from conversation_members)`);
await su.query(`insert into conversation_members(conversation_id,user_id) select vc.id, $1 from vc`, [O1]);
await su.query(`insert into conversation_members(conversation_id,user_id) select vc.id, $2 from vc`, [O1, C[1]]).catch(() => null);
await su.query(`insert into messages(conversation_id,sender_id,text,created_at,from_assistant) select vc.id, case when g % 2 = 0 then $1::uuid else $2::uuid end, 'x', now() - (g || ' minutes')::interval, false from vc, generate_series(1,80) g`, [O1, C[9]]);
await su.query("set session_replication_role = origin");
const t0 = Date.now(); const big = await get(O1, 90); const ms = Date.now() - t0;
ok("com 24 mil mensagens a consulta ainda responde rápido", (await cnt("select count(*)::int n from messages")) > 24000 && ms < 4000 && big.metrics.pessoas_que_falaram.current >= 5, `${ms} ms`);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

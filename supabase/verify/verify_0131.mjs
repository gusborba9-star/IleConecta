// Verificação LOCAL da migration 0131 (pessoas da casa: segmentos e linha do tempo).
// Uso: node supabase/verify/verify_0131.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0131";
const { c: su, failed } = await freshDb(name, { with64: true, max: 130 });
ok("migrations 0001–0130 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const MIGFILE = process.env.MIG_FILE ?? "0131_pessoas_da_casa.sql";
const mig = readFileSync(new URL(`../migrations/${MIGFILE}`, import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0131 aplica e reaplica sem erro", e0 === null, e0 ?? "");
ok("não cria tabela nova (nenhuma cópia paralela)", (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n === tablesBefore);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 140)); return r; };
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
const uuid = (p, i) => `${p}0131000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const T = (h) => `now() - interval '${h} hours'`;

// pessoas: H1 (Premium, equipe S1), H2 (Grátis), H3 (outra casa)
const O1 = uuid("a", 1), O2 = uuid("a", 2), O3 = uuid("a", 3), S1 = uuid("e", 1), NOB = uuid("f", 1);
const P = {}; ["Ana", "Bia", "Caio", "Dora", "Edu", "Fabi", "Gil", "Hugo", "Iara", "Zé", "Jade", "Kai", "Lia", "Mia", "Nina", "Omar", "Yuri"].forEach((n, i) => (P[n] = uuid("c", i + 1)));
const H1 = uuid("d", 1), H2 = uuid("d", 2), H3 = uuid("d", 3);
const mk = async (id, t, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(/\W/g, "")}${id.slice(-3)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city,state,bio) values ($1,$2,$3,'Salvador','BA','BIO-SECRETA') on conflict (id) do update set account_type=$2, display_name=$3", [id, t, nm]); };
for (const [id, t, nm] of [[O1, "casa", "Dona Um"], [O2, "casa", "Dona Dois"], [O3, "casa", "Dona Tres"], [S1, "cliente", "Equipe"], [NOB, "cliente", "Sem Casa"]]) await mk(id, t, nm);
for (const [n, id] of Object.entries(P)) await mk(id, "cliente", n);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','maximo'),($3,$4,'Casa Dois','casa-dois','gratis'),($5,$6,'Casa Tres','casa-tres','maximo')", [H1, O1, H2, O2, H3, O3]);
await su.query("insert into house_staff(house_id,user_id,name,active,perms) values ($1,$2,'Equipe',true,'{}')", [H1, S1]);
const setPerms = (p) => su.query("update house_staff set perms=$1 where house_id=$2", [p, H1]);

const people = (uid, seg, search, lim, off) => as(uid, (c) => q(c, "select public.house_people($1,$2,$3,$4) r", [seg ?? "todos", search ?? null, lim ?? 50, off ?? 0]));
const tl = (uid, person, lim) => as(uid, (c) => q(c, "select public.house_person_timeline($1,$2) r", [person, lim ?? 100]));
const list = async (uid, seg, search, lim, off) => { const r = await people(uid, seg, search, lim, off); if (r.err) throw new Error(r.err); return r.rows[0].r; };
const line = async (uid, person, lim) => { const r = await tl(uid, person, lim); if (r.err) throw new Error(r.err); return r.rows[0].r; };
const names = (v) => v.items.map((i) => i.name).sort();

// ---- acesso
const anonL = await as(null, (c) => q(c, "select public.house_people('todos',null,50,0) r"), "anon");
const anonT = await as(null, (c) => q(c, "select public.house_person_timeline($1,10) r", [P.Ana]), "anon");
ok("visitante sem login não consulta lista nem linha do tempo", !!anonL.err && !!anonT.err);
const nh = await people(NOB), cl = await people(P.Ana);
ok("pessoa sem casa e cliente comum não consultam", /not_house/.test(nh.err ?? "") && /not_house/.test(cl.err ?? ""), `${nh.err} | ${cl.err}`);
const acl = await sv(`select has_function_privilege('authenticated','public.house_people_base(uuid,uuid,boolean,boolean,boolean,boolean)','execute') b, has_function_privilege('authenticated','public.house_people_ctx()','execute') c,
  has_function_privilege('anon','public.house_people(text,text,integer,integer)','execute') a, has_function_privilege('authenticated','public.house_people(text,text,integer,integer)','execute') l,
  has_function_privilege('authenticated','public.house_person_timeline(uuid,integer)','execute') t, has_function_privilege('public','public.house_people(text,text,integer,integer)','execute') p`);
ok("ACL: base e contexto internos fechados; lista e linha do tempo só para logados", !acl.rows[0].b && !acl.rows[0].c && !acl.rows[0].a && acl.rows[0].l && acl.rows[0].t && !acl.rows[0].p, JSON.stringify(acl.rows[0]));
const direct = await as(O1, (c) => q(c, "select * from public.house_people_base($1,$2,true,true,true,true)", [H1, O1]));
ok("usuário não chama a base direto (passando a casa que quiser)", !!direct.err);
const emptyV = await list(O2);
ok("casa sem relações: lista vazia", emptyV.total === 0 && emptyV.items.length === 0 && emptyV.counts.todos === 0);

// ---- relações da H1
const conv = async (owner, other) => { const id = (await su.query("insert into conversations default values returning id")).rows[0].id; await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [id, owner, other]); return id; };
const msg = (cid, sender, ago, text = "MENSAGEM-SECRETA") => force(`insert into messages(conversation_id,sender_id,text,created_at) values ($1,$2,$3,${ago})`, [cid, sender, text]);
const fol = (u, h, ago = T(100)) => force(`insert into follows(follower_id,house_id,created_at) values ($1,$2,${ago})`, [u, h]);
const ord = (h, c, st, extra = "", vals = "") => force(`insert into service_orders(house_id,client_id,title,price_cents,status${extra}) values ($1,$2,'Trabalho de limpeza',5000,$3${vals}) returning id`, [h, c, st]);

await fol(P.Ana, H1); await fol(P.Bia, H1); await fol(P.Ana, H3); await fol(P.Hugo, H3);
const CV_ANA = await conv(O1, P.Ana); await msg(CV_ANA, P.Ana, T(30));                                   // Ana falou e ninguém respondeu: pendência
const CV_BIA = await conv(O1, P.Bia); await msg(CV_BIA, P.Bia, T(30)); await msg(CV_BIA, O1, T(29));       // Bia falou e a casa respondeu
const CV_CAIO = await conv(O1, P.Caio);                                                                   // conversa vazia: não conta como "conversou"
const CV_DORA = await conv(O1, P.Dora); await msg(CV_DORA, O1, T(20));                                    // só a casa falou: não conta
const CV_ZE = await conv(O1, P["Zé"]); await msg(CV_ZE, P["Zé"], T(40));
await force("insert into user_blocks(blocker_id,blocked_id) values ($1,$2)", [O1, P["Zé"]]);              // bloqueado: some
const CV_OTHER = await conv(O3, P.Hugo); await msg(CV_OTHER, P.Hugo, T(30));                              // conversa de OUTRA casa
const CV_S = await conv(O1, S1); await msg(CV_S, S1, T(30));                                              // a própria equipe não é "cliente"
// pedidos
await ord(H1, P.Edu, "concluido", ",created_at,finished_at", `,${T(24 * 10)},${T(24 * 9)}`); await ord(H1, P.Edu, "concluido", ",created_at", `,${T(24 * 5)}`);     // recorrente
await ord(H1, P.Fabi, "aguardando_pagamento"); await ord(H1, P.Fabi, "expirado");                                                                                  // interessada, não comprou
await ord(H1, P.Gil, "concluido", ",created_at", `,${T(24 * 120)}`);                                                                                                // comprou há 120 dias: sumido
await ord(H1, P.Iara, "confirmado");                                                                                                                                // paga, esperando a casa: pendência
await ord(H1, P.Dora, "reembolsado");                                                                                                                               // reembolsado: sem relação de compra
await ord(H3, P.Hugo, "concluido"); await ord(H3, P.Ana, "concluido");                                                                                              // OUTRA casa
// ritual
const EV1 = (await force("insert into events(house_id,title,price_cents,seats_total,starts_at,status) values ($1,'Gira de Cura',3000,10,now() + interval '3 days','publicado') returning id", [H1])).rows[0].id;
await force("insert into reservations(event_id,user_id,status) values ($1,$2,'confirmada')", [EV1, P.Bia]);
// membro
const Mq = async (house, user, nm) => (await force(`insert into house_members(house_id,user_id,display_name,bond,monthly_cents,due_day,start_month) values ($1,$2,$3,'filho',5000,5,(date_trunc('month', current_date) - interval '3 months')::date) returning id`, [house, user, nm])).rows[0].id;
const M_BIA = await Mq(H1, P.Bia, "Bia"); const M_MANUAL = (await force(`insert into house_members(house_id,display_name,monthly_cents,due_day,start_month) values ($1,'Membro Sem Conta',5000,5,(date_trunc('month', current_date) - interval '3 months')::date) returning id`, [H1])).rows[0].id;
await force("insert into member_dues(member_id,house_id,month,amount_cents,due_date,status) values ($1,$2,(date_trunc('month', current_date) - interval '1 month')::date,5000,current_date - 5,'aberta')", [M_BIA, H1]);
await force("insert into member_dues(member_id,house_id,month,amount_cents,due_date,status,paid_via,paid_at) values ($1,$2,(date_trunc('month', current_date) - interval '2 month')::date,5000,current_date - 35,'paga','manual',now() - interval '30 days')", [M_BIA, H1]);
// avaliações e reembolso (Edu)
const O_EDU = (await sv("select id from service_orders where client_id=$1 order by created_at limit 1", [P.Edu])).rows[0].id;
await force("insert into reviews(house_id,author_id,rating,comment,service_order_id) values ($1,$2,5,'ÓTIMO-SECRETO',$3)", [H1, P.Edu, O_EDU]);
const O_GIL = (await sv("select id from service_orders where client_id=$1", [P.Gil])).rows[0].id;
await force("insert into reviews(house_id,author_id,rating,comment,service_order_id,anonymous) values ($1,$2,2,'ANONIMA-SECRETA',$3,true)", [H1, P.Gil, O_GIL]);
const O_RF = (await ord(H1, P.Edu, "reembolso_pendente")).rows[0].id;
const PAY = (await force(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',5000,'confirmado','v2-2026-10',500,now(),'pix') returning id`, [O_RF])).rows[0].id;
await force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,$3,$4,'antes_do_inicio','Não recebi o atendimento',5000,'pendente')`, [PAY, O_RF, H1, P.Edu]);
// ---- cenários de borda
await fol(O1, H1); await fol(P.Nina, H1, T(24 * 100));
const CV_JADE = await conv(O1, P.Jade); await msg(CV_JADE, P.Jade, T(24 * 40));
const CV_OMAR = await conv(O1, P.Omar); await msg(CV_OMAR, O1, T(50)); await msg(CV_OMAR, P.Omar, T(40)); await force("update messages set deleted_at=now() where conversation_id=$1 and sender_id=$2", [CV_OMAR, P.Omar]);
const CV_YURI = await conv(O1, P.Yuri); await msg(CV_YURI, P.Yuri, T(30)); await force("insert into user_blocks(blocker_id,blocked_id) values ($1,$2)", [P.Yuri, O1]);
await force("insert into house_members(house_id,user_id,display_name,monthly_cents,due_day,start_month,left_at,left_by) values ($1,$2,'Kai',5000,5,(date_trunc('month', current_date) - interval '3 months')::date,now(),'casa')", [H1, P.Kai]);
const M_LIA = (await force(`insert into house_members(house_id,user_id,display_name,bond,monthly_cents,due_day,start_month) values ($1,$2,'Lia','filha',5000,5,(date_trunc('month', current_date) - interval '3 months')::date) returning id`, [H1, P.Lia])).rows[0].id;
await force("insert into member_dues(member_id,house_id,month,amount_cents,due_date,status,paid_via,paid_at) values ($1,$2,(date_trunc('month', current_date) - interval '1 month')::date,5000,current_date - 25,'paga','manual',now() - interval '20 days')", [M_LIA, H1]);
await force("insert into member_dues(member_id,house_id,month,amount_cents,due_date,status) values ($1,$2,date_trunc('month', current_date)::date,5000,current_date + 10,'aberta')", [M_LIA, H1]);
await ord(H1, P.Mia, "concluido", ",created_at", `,${T(24 * 60)}`);
await ord(H1, P.Edu, "cancelado");
await ord(H3, P.Edu, "concluido"); const O_EDU3 = (await sv("select id from service_orders where house_id=$1 and client_id=$2", [H3, P.Edu])).rows[0].id;
await force("insert into reviews(house_id,author_id,rating,comment,service_order_id) values ($1,$2,1,'OUTRA-CASA-SECRETA',$3)", [H3, P.Edu, O_EDU3]);
await force("insert into handoff_events(conversation_id,house_owner_id,action) values ($1,$2,'passada_para_casa')", [CV_ANA, O1]);
const CV_ANA3 = await conv(O3, P.Ana); await msg(CV_ANA3, P.Ana, T(1)); await msg(CV_ANA3, O3, T(0.5)); await force("insert into handoff_events(conversation_id,house_owner_id,action) values ($1,$2,'assumida')", [CV_ANA3, O3]);
await force("insert into house_members(house_id,user_id,display_name,monthly_cents,due_day,start_month) values ($1,$2,'Caio',5000,5,date_trunc('month', current_date)::date)", [H2, P.Caio]);
ok("dados de teste semeados por completo", (await cnt("select count(*)::int n from follows")) === 6 && (await cnt("select count(*)::int n from service_orders")) === 13 && (await cnt("select count(*)::int n from reservations")) === 1 && (await cnt("select count(*)::int n from house_members")) === 5 && (await cnt("select count(*)::int n from member_dues")) === 4 && (await cnt("select count(*)::int n from reviews")) === 3 && (await cnt("select count(*)::int n from refund_requests")) === 1 && (await cnt("select count(*)::int n from user_blocks")) === 2 && (await cnt("select count(*)::int n from handoff_events")) === 2, JSON.stringify((await sv("select (select count(*) from service_orders) o")).rows[0]));

let v = await list(O1);
const seg = (s) => v.items.filter((i) => i.segments.includes(s)).map((i) => i.name).sort();
ok("quem aparece: só quem tem relação real com a casa 1", names(v).join(",") === ["Ana", "Bia", "Edu", "Fabi", "Gil", "Iara", "Jade", "Lia", "Mia", "Nina", "Omar"].sort().join(","), names(v).join(","));
ok("não aparecem: bloqueado, equipe, dona, conversa vazia, só a casa falou, reembolsado, pessoa só de outra casa", !["Zé", "Equipe", "Dona Um", "Caio", "Dora", "Hugo", "Kai", "Yuri"].some((n) => names(v).includes(n)));
ok("seguidores", seg("seguidor").join() === "Ana,Bia,Nina", seg("seguidor").join());
ok("conversaram (mandaram mensagem)", seg("conversou").join() === "Ana,Bia,Jade,Omar", seg("conversou").join());
ok("clientes: Bia (ritual), Edu, Gil, Iara, Mia", seg("cliente").join() === "Bia,Edu,Gil,Iara,Mia", seg("cliente").join());
ok("recorrentes: Edu (2 pedidos pagos)", seg("recorrente").join() === "Edu", seg("recorrente").join());
ok("interessada: Fabi (pedido sem pagar); quem comprou não é 'interessado'", seg("interessado").join() === "Fabi", seg("interessado").join());
ok("Edu tem pedido não pago mas já comprou: não é interessado; Mia (60 dias) e Nina (seguidora antiga) não são sumidos; Jade (40 dias) e Omar (última mensagem apagada) sem pendência; Lia (paga + a vencer) sem pendência", !seg("interessado").includes("Edu") && !seg("sumido").includes("Mia") && !seg("sumido").includes("Nina") && !seg("pendencia").includes("Jade") && !seg("pendencia").includes("Omar") && !seg("pendencia").includes("Lia"));
ok("participante de ritual: Bia", seg("participante").join() === "Bia");
ok("membro com conta: Bia; membro sem conta não vira pessoa", seg("membro").join() === "Bia,Lia" && !names(v).includes("Membro Sem Conta"));
ok("pendência: Ana (sem resposta), Iara (pago esperando início), Bia (mensalidade vencida)", seg("pendencia").join() === "Ana,Bia,Iara", seg("pendencia").join());
ok("sumido: Gil (última compra há 120 dias)", seg("sumido").join() === "Gil", seg("sumido").join());
ok("contagens por segmento batem com as listas", v.counts.todos === 11 && v.counts.seguidor === 3 && v.counts.cliente === 5 && v.counts.recorrente === 1 && v.counts.interessado === 1 && v.counts.membro === 2 && v.counts.pendencia === 3 && v.counts.sumido === 1 && v.counts.participante === 1 && v.counts.conversou === 4, JSON.stringify(v.counts));
const edu = v.items.find((i) => i.name === "Edu"), bia = v.items.find((i) => i.name === "Bia");
ok("titular vê valores: Edu 2 compras, R$ 100,00; Bia R$ 30,00 do ritual", edu.purchases === 2 && edu.spent_cents === 10000 && bia.spent_cents === 3000, `${edu.spent_cents} ${bia.spent_cents}`);
ok("a lista nunca traz texto de mensagem, bio ou avaliação", !JSON.stringify(v).includes("MENSAGEM-SECRETA") && !JSON.stringify(v).includes("BIO-SECRETA") && !JSON.stringify(v).includes("SECRETA"));
ok("ordenação: atividade mais recente primeiro", v.items.every((it, i) => i === 0 || !it.last_at || !v.items[i - 1].last_at || new Date(v.items[i - 1].last_at) >= new Date(it.last_at)));

// ---- filtros, busca, paginação e entradas hostis
const fSeg = await list(O1, "cliente");
ok("filtro por segmento", fSeg.total === 5 && names(fSeg).join() === "Bia,Edu,Gil,Iara,Mia" && fSeg.counts.todos === 11);
ok("busca por nome (sem diferenciar maiúscula)", names(await list(O1, "todos", "edU")).join() === "Edu");
ok("busca com % ou _ é literal, não coringa", (await list(O1, "todos", "%")).total === 0 && (await list(O1, "todos", "_")).total === 0 && (await list(O1, "todos", "E_u")).total === 0);
ok("busca com aspas, barra e SQL não quebra nem vaza", (await list(O1, "todos", "'; drop table profiles; --")).total === 0 && (await list(O1, "todos", "\\")).total === 0 && (await cnt("select count(*)::int n from profiles")) > 0);
ok("busca enorme é cortada, sem erro", (await list(O1, "todos", "a".repeat(5000))).total === 0);
const bad1 = await people(O1, "inventado"), bad2 = await people(O1, "todos'; --");
ok("segmento inexistente é recusado", /segmento_invalido/.test(bad1.err ?? "") && !!bad2.err);
const pg1 = await list(O1, "todos", null, 4, 0), pg2 = await list(O1, "todos", null, 4, 4), pg3 = await list(O1, "todos", null, 4, 8), pgAll = [...pg1.items, ...pg2.items, ...pg3.items].map((i) => i.person_id);
ok("paginação cobre todos sem repetir", pgAll.length === 11 && new Set(pgAll).size === 11 && pg1.total === 11 && pg3.items.length === 3);
ok("limite é limitado a 100 e nunca negativo; deslocamento negativo vira zero", (await list(O1, "todos", null, 100000, -5)).items.length === 11 && (await list(O1, "todos", null, -3, 0)).items.length === 1 && (await list(O1, "todos", null, null, null)).items.length === 11);

// ---- isolamento entre casas
const v3 = await list(O3);
ok("casa 3 vê só as suas relações (Hugo e Ana), nada da casa 1", names(v3).join() === "Ana,Edu,Hugo", names(v3).join());
const ana3 = v3.items.find((i) => i.name === "Ana");
ok("a mesma pessoa tem relação separada em cada casa (Ana: pendência só na casa 1, onde a casa não respondeu)", ana3.segments.includes("seguidor") && ana3.segments.includes("cliente") && ana3.segments.includes("conversou") && !ana3.segments.includes("pendencia"), JSON.stringify(ana3.segments));
const cross = await tl(O1, P.Hugo), cross2 = await tl(O1, NOB), cross3 = await tl(O1, O3), cross4 = await tl(O1, null), cross5 = await tl(O1, "00000000-0000-0000-0000-000000000000");
ok("linha do tempo de quem não tem relação com a casa é recusada (sem enumerar perfis)", [cross, cross2, cross3, cross4, cross5].every((r) => /not_related/.test(r.err ?? "")), [cross, cross2, cross3, cross4, cross5].map((r) => r.err).join(" | "));
const blockedTl = await tl(O1, P["Zé"]), caioTl = await tl(O1, P.Caio);
ok("bloqueado e quem só tem conversa vazia: sem linha do tempo", /not_related/.test(blockedTl.err ?? "") && /not_related/.test(caioTl.err ?? ""));
const selfTl = await tl(O1, O1), staffTl = await tl(O1, S1);
ok("a dona e a equipe não têm linha do tempo de 'cliente'", /not_related/.test(selfTl.err ?? "") && /not_related/.test(staffTl.err ?? ""));

// ---- linha do tempo (titular)
const tEdu = await line(O1, P.Edu);
const kinds = (t) => t.events.map((e) => e.kind);
ok("linha do tempo do Edu: pedidos, concluído, avaliação e reembolso, do mais novo ao mais antigo", ["pedido", "pedido_concluido", "avaliacao", "reembolso"].every((k) => kinds(tEdu).includes(k)) && tEdu.events.every((e, i) => i === 0 || new Date(tEdu.events[i - 1].at) >= new Date(e.at)), kinds(tEdu).join());
ok("cada evento aponta para o registro original (tipo e id)", tEdu.events.every((e) => e.kind && e.ref_id && e.title && e.at));
ok("linha do tempo traz a pessoa, segmentos e valores para a titular", tEdu.person.name === "Edu" && tEdu.person.segments.includes("recorrente") && tEdu.person.spent_cents === 10000);
const tAna = await line(O1, P.Ana);
ok("Ana: seguiu, conversa e última mensagem; nada da casa 3", ["seguiu", "conversa", "mensagem"].every((k) => kinds(tAna).includes(k)) && !kinds(tAna).includes("pedido"), kinds(tAna).join());
const tBia = await line(O1, P.Bia);
ok("Bia: ritual, membro e mensalidades (vencida e paga)", ["reserva", "membro", "mensalidade"].every((k) => kinds(tBia).includes(k)) && tBia.events.filter((e) => e.kind === "mensalidade").map((e) => e.title).sort().join("|") === "Mensalidade paga|Mensalidade vencida", tBia.events.filter((e) => e.kind === "mensalidade").map((e) => e.title).join("|"));
const tGil = await line(O1, P.Gil);
const tEdu2 = await line(O1, P.Edu);
ok("avaliação de OUTRA casa nunca entra na linha do tempo", !JSON.stringify(tEdu2).includes("OUTRA-CASA") && tEdu2.events.filter((e) => e.kind === "avaliacao").length === 1);
const tAna2 = await line(O1, P.Ana);
ok("evento da assistente desta casa aparece; o de outra casa não", tAna2.events.filter((e) => e.kind === "assistente_passada_para_casa").length === 1 && !tAna2.events.some((e) => e.kind === "assistente_assumida"));
const msgBia = tBia.events.find((e) => e.kind === "mensagem");
ok("'última mensagem' é da pessoa, não da casa (Bia falou há 30 h; a casa respondeu há 29 h)", !!msgBia && Date.now() - Date.parse(msgBia.at) > 29.5 * 3600 * 1000, msgBia?.at);
ok("avaliação anônima nunca liga a pessoa", !kinds(tGil).includes("avaliacao") && !JSON.stringify(tGil).includes("ANONIMA"));
ok("a linha do tempo não traz texto de mensagem, comentário de avaliação, motivo de reembolso nem bio", !/MENSAGEM-SECRETA|ÓTIMO-SECRETO|BIO-SECRETA|Não recebi/.test(JSON.stringify([tEdu, tAna, tBia, tGil])));
const tLim = await line(O1, P.Edu, 2), tLim0 = await line(O1, P.Edu, 0), tLimBig = await line(O1, P.Edu, 999999);
ok("limite da linha do tempo: respeitado, mínimo 1, máximo 200", tLim.events.length === 2 && tLim0.events.length === 1 && tLimBig.events.length === tEdu.events.length);
// conversa de outra casa não aparece na linha do tempo da Ana da casa 1
await msg(await conv(O3, P.Ana), P.Ana, T(1));
ok("conversa da pessoa com OUTRA casa não entra na linha do tempo desta casa", (await line(O1, P.Ana)).events.filter((e) => e.kind === "conversa").length === 1);

// ---- equipe: só o que a permissão libera
const sp = async (perms, fn) => { await setPerms(perms); return fn(); };
let r = await people(S1);
ok("equipe sem nenhuma permissão: sem acesso", /sem_permissao/.test(r.err ?? ""), r.err);
await sp(["post", "calendar", "stats"], async () => { const e = await people(S1); ok("equipe só com publicar/agenda/indicadores: sem acesso", /sem_permissao/.test(e.err ?? "")); });
await sp(["chat_read"], async () => {
  const vv = await list(S1);
  ok("equipe com conversas: só vê quem conversou e quem segue; sem clientes, sem valores", names(vv).join() === "Ana,Bia,Jade,Nina,Omar" && vv.items.every((i) => i.spent_cents === null && !i.segments.includes("cliente")), names(vv).join());
  const t = await line(S1, P.Ana);
  ok("equipe com conversas: linha do tempo sem pedido, sem avaliação, sem reembolso, sem mensalidade", t.events.every((e) => ["seguiu", "conversa", "mensagem", "assistente_passada_para_casa"].includes(e.kind)) && t.role === "equipe");
  const t2 = await tl(S1, P.Edu);
  ok("equipe com conversas não abre pessoa que só aparece por pedidos", /not_related/.test(t2.err ?? ""));
});
await sp(["chat_reply"], async () => { ok("chat_reply também libera conversas", names(await list(S1)).join() === "Ana,Bia,Jade,Nina,Omar"); });
await sp(["orders"], async () => {
  const vv = await list(S1);
  ok("equipe com pedidos: vê clientes, interessados e participantes; valores NUNCA", vv.items.length > 0 && vv.items.every((i) => i.spent_cents === null) && names(vv).includes("Edu") && !names(vv).includes("Ana"), names(vv).join());
  const t = await line(S1, P.Edu);
  ok("equipe com pedidos: vê pedidos, mas não avaliação nem reembolso", kinds(t).includes("pedido") && !kinds(t).includes("avaliacao") && !kinds(t).includes("reembolso") && t.person.spent_cents === null, kinds(t).join());
  const tb = await line(S1, P.Bia);
  ok("equipe com pedidos vê a reserva da Bia, mas não mensalidade nem condição de membro", kinds(tb).includes("reserva") && !kinds(tb).includes("mensalidade") && !kinds(tb).includes("membro"), kinds(tb).join());
  ok("equipe com pedidos não vê pendência de conversa nem de mensalidade", !(await list(S1)).items.some((i) => i.name === "Ana"));
});
await sp(["members"], async () => {
  const vv = await list(S1);
  ok("equipe com membros (Premium): vê membros e mensalidades", names(vv).join() === "Bia,Lia" && vv.items.find((i) => i.name === "Bia").segments.includes("pendencia") && !vv.items.find((i) => i.name === "Lia").segments.includes("pendencia"), names(vv).join());
  const t = await line(S1, P.Bia);
  ok("equipe com membros: mensalidade sim; ritual, pedido e conversa não", kinds(t).includes("mensalidade") && !kinds(t).includes("reserva") && !kinds(t).includes("conversa"), kinds(t).join());
});
await su.query("update houses set plan='gratis' where id=$1", [H1]);
await sp(["members"], async () => { const e = await people(S1); ok("equipe com membros em casa sem a área de membros: sem acesso", /sem_permissao|not_house/.test(e.err ?? ""), e.err); });
await su.query("update houses set plan='maximo' where id=$1", [H1]);
await sp(["chat_read", "orders", "members"], async () => { const vv = await list(S1); ok("equipe com tudo (sem financeiro): vê todos, sem valores", vv.total === 11 && vv.items.every((i) => i.spent_cents === null)); });
await su.query("update house_staff set active=false where house_id=$1", [H1]);
const off = await people(S1); ok("equipe desativada perde o acesso", /not_house/.test(off.err ?? ""));
await su.query("update house_staff set active=true where house_id=$1", [H1]);
const strangerTl = await as(P.Ana, (c) => q(c, "select public.house_person_timeline($1,10) r", [P.Bia]));
ok("cliente comum não abre linha do tempo de ninguém", /not_house/.test(strangerTl.err ?? ""));

// ---- casa Grátis: ainda funciona (seguidores e conversas), sem membros
await fol(P.Caio, H2); await msg(await conv(O2, P.Caio), P.Caio, T(30));
const v2 = await list(O2);
ok("casa Grátis: vê seguidores e conversas dela; membro cadastrado sem a área de membros não vira segmento", names(v2).join() === "Caio" && !v2.items[0].segments.includes("membro") && v2.items[0].segments.includes("conversou") && v2.items[0].segments.includes("pendencia"));

// ---- só leitura e função
const snap = async () => (await sv(`select (select count(*) from messages)::int a, (select count(*) from service_orders)::int b, (select count(*) from member_dues)::int c, (select count(*) from follows)::int d, (select count(*) from refund_requests)::int e, (select count(*) from notifications)::int f, (select count(*) from admin_audit)::int g, (select count(*) from reviews)::int h`)).rows[0];
const s1 = await snap(); await list(O1); await line(O1, P.Edu); await list(O3); const s2 = await snap();
ok("consultar não altera nada", JSON.stringify(s1) === JSON.stringify(s2));
const fn = await sv("select proname, provolatile v, prosecdef d, proconfig c from pg_proc where proname in ('house_people','house_person_timeline','house_people_base','house_people_ctx') order by 1");
ok("quatro funções: stable, security definer, search_path fixo", fn.rows.length === 4 && fn.rows.every((f) => f.v === "s" && f.d === true && /search_path=public/.test(String(f.c))), JSON.stringify(fn.rows));

// ---- volume
for (let i = 0; i < 400; i++) { const u = `b${String(i).padStart(7, "0")}-0000-0000-0000-000000000001`; await su.query("insert into auth.users(id,email) values ($1,$2)", [u, `v${i}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente',$2) on conflict do nothing", [u, `Cliente ${i}`]); await fol(u, H1, T(i + 1)); if (i % 2 === 0) await msg(await conv(O1, u), u, T(30)); if (i % 3 === 0) await ord(H1, u, "concluido"); }
let t0 = Date.now(); v = await list(O1, "todos", null, 100, 0); const ms = Date.now() - t0;
ok("com 400+ pessoas: página de 100, total real", v.items.length === 100 && v.total >= 400, `${v.items.length}/${v.total}`);
ok("pedir mais de 100 devolve no máximo 100", (await list(O1, "todos", null, 100000, 0)).items.length === 100);
for (let i = 0; i < 230; i++) await ord(H1, P.Edu, "concluido");
ok("linha do tempo nunca passa de 200 eventos", (await line(O1, P.Edu, 100000)).events.length === 200);
ok("responde rápido", ms < 2000, `${ms} ms`);
t0 = Date.now(); const tt = await line(O1, "b0000000-0000-0000-0000-000000000001"); const ms2 = Date.now() - t0;
ok("linha do tempo rápida com muitos dados", tt.events.length >= 1 && ms2 < 1500, `${ms2} ms`);

// ---- volume de mensagens: casa movimentada (400 conversas x 60 mensagens)
await su.query("set session_replication_role = replica");
await su.query(`insert into conversations(id) select gen_random_uuid() from generate_series(1,400)`);
await su.query(`create temp table vc as select id, row_number() over () rn from conversations where id not in (select conversation_id from conversation_members)`);
await su.query(`insert into conversation_members(conversation_id,user_id) select vc.id, $1 from vc`, [O1]);
await su.query(`insert into conversation_members(conversation_id,user_id) select vc.id, p.id from vc join (select id, row_number() over (order by id) rn from profiles where id::text like 'b0%') p on p.rn = ((vc.rn - 1) % 400) + 1`);
await su.query(`insert into messages(conversation_id,sender_id,text,created_at) select vc.id, case when g % 2 = 0 then $1::uuid else cm.user_id end, 'x', now() - (g || ' minutes')::interval from vc join conversation_members cm on cm.conversation_id = vc.id and cm.user_id <> $1, generate_series(1,60) g`, [O1]);
await su.query("set session_replication_role = origin");
ok("preparo do volume: 24 mil mensagens", (await cnt("select count(*)::int n from messages")) >= 24000);
t0 = Date.now(); const vm = await list(O1, "conversou", null, 50, 0); const ms3 = Date.now() - t0;
ok("com 24 mil mensagens a lista ainda responde rápido", vm.total >= 400 && ms3 < 3000, `${ms3} ms`);
t0 = Date.now(); await line(O1, vm.items[0].person_id); const ms4 = Date.now() - t0;
ok("linha do tempo com muitas mensagens também", ms4 < 1500, `${ms4} ms`);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

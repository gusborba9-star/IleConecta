// Verificação LOCAL da migration 0118 (proposta de horário pelo chat). Uso: node supabase/verify/verify_0118.mjs  (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0118";
const { c: su, failed } = await freshDb(name, { with64: true, max: 118 });
ok("migrations 0001–0118 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
const mig = readFileSync(new URL("../migrations/0118_proposta_de_horario_pelo_chat.sql", import.meta.url), "utf8");
let again = null; try { await su.query(mig); } catch (e) { again = e.message; }
ok("0118 reaplica sem erro (idempotente)", again === null, again ?? "");
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
// o grant geral desfaz as permissões da migration: reaplica as que importam
await su.query(`revoke all on public.schedule_proposals from anon, authenticated; grant select on public.schedule_proposals to authenticated;
  revoke execute on function public.schedule_conflict(uuid,timestamptz,timestamptz,uuid), public.schedule_conflict_text(text), public.proposal_when_text(timestamptz), public.messages_proposal_guard() from public, anon, authenticated;
  revoke execute on function public.service_offered_to_me(uuid) from public, anon, authenticated;
  revoke execute on function public.check_proposal_slot(uuid,timestamptz), public.propose_schedule(uuid,uuid,timestamptz), public.proposal_card(uuid), public.accept_proposal(uuid,text), public.cancel_proposal(uuid) from public, anon;`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (role, uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const U = { H: "c0118000-0000-0000-0000-00000000000a", H2: "c0118000-0000-0000-0000-00000000000b", C: "c0118000-0000-0000-0000-00000000000c", C2: "c0118000-0000-0000-0000-0000000000c2", X: "c0118000-0000-0000-0000-00000000000e" };
const HID = "d0118000-0000-0000-0000-0000000000aa", HID2 = "d0118000-0000-0000-0000-0000000000bb";
for (const [k, u] of Object.entries(U)) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, `${k}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set account_type=$2", [u, ["H", "H2"].includes(k) ? "casa" : "cliente", "Pessoa " + k]);
}
await su.query("set session_replication_role = replica");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa H','casa-h','maximo'),($3,$4,'Casa H2','casa-h2','maximo')", [HID, U.H, HID2, U.H2]);
await su.query("set session_replication_role = origin");
for (const u of [U.C, U.C2, U.X]) for (const d of ["termos_cliente", "dados_sensiveis"]) await su.query("insert into legal_consents(user_id,doc_key,doc_version) values ($1,$2,'x')", [u, d]).catch(() => null);
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
const DESC = "Descrição longa o suficiente para passar na validação mínima de descrição do serviço.";
const svc = async (house, kind, title, delivery, bookable, price = 19900) => (await su.query("insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,$2,$3,$4,$5,true,$6,$7,60) returning id", [house, kind, title, DESC, price, delivery, bookable])).rows[0].id;
const S_AG = await svc(HID, "buzios", "Búzios", "presencial", true);
const S_NB = await svc(HID, "limpeza", "Limpeza", "presencial", false);
const S_OTHER = await svc(HID2, "buzios", "Búzios H2", "presencial", true);
const day = (n, h) => { const d = new Date(Date.now() + n * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const T1 = day(5, 19), T2 = day(6, 19), T3 = day(7, 19), T4 = day(8, 19), T5 = day(9, 19);

// ---- ACL
const priv = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
for (const f of ["check_proposal_slot(uuid,timestamptz)", "propose_schedule(uuid,uuid,timestamptz)", "proposal_card(uuid)", "accept_proposal(uuid,text)", "cancel_proposal(uuid)"])
  ok(`ACL: ${f.split("(")[0]} só authenticated`, (await priv("authenticated", `public.${f}`)) && !(await priv("anon", `public.${f}`)));
for (const f of ["schedule_conflict(uuid,timestamptz,timestamptz,uuid)", "schedule_conflict_text(text)", "proposal_when_text(timestamptz)", "messages_proposal_guard()"])
  ok(`ACL: ${f.split("(")[0]} interna`, !(await priv("authenticated", `public.${f}`)) && !(await priv("anon", `public.${f}`)));
ok("ACL: tabela sem escrita direta e sem anon", !(await su.query("select has_table_privilege('authenticated','public.schedule_proposals','insert') a, has_table_privilege('anon','public.schedule_proposals','select') b")).rows.some((r) => r.a || r.b));

const chk = (uid, s, t) => as("authenticated", uid, (c) => q(c, "select public.check_proposal_slot($1,$2) r", [s, t])).then((x) => x.rows?.[0]?.r ?? { err: x.err });
const prop = (uid, s, cl, t) => as("authenticated", uid, (c) => q(c, "select public.propose_schedule($1,$2,$3) r", [s, cl, t])).then((x) => x.err ? { err: x.err } : x.rows[0].r);
const card = (uid, id) => as("authenticated", uid, (c) => q(c, "select public.proposal_card($1) r", [id])).then((x) => x.rows?.[0]?.r ?? null);
const acc = (uid, id) => as("authenticated", uid, (c) => q(c, "select public.accept_proposal($1,'') r", [id])).then((x) => x.err ? { err: x.err } : x.rows[0].r);
const cancel = (uid, id) => as("authenticated", uid, (c) => q(c, "select public.cancel_proposal($1) r", [id])).then((x) => x.err ? { err: x.err } : x.rows[0].r);

// ---- verificação prévia
ok("horário livre: ok", (await chk(U.H, S_AG, T1)).ok === true);
ok("horário no passado: recusado", (await chk(U.H, S_AG, new Date(Date.now() + 60000).toISOString())).ok === false);
ok("horário distante demais (>180 dias): recusado", (await chk(U.H, S_AG, day(200, 19))).ok === false);
ok("quem não é a casa não confere nem propõe", Boolean((await chk(U.C, S_AG, T1)).err) && Boolean((await prop(U.C, S_AG, U.C2, T1)).err) && Boolean((await chk(U.H2, S_AG, T1)).err));
await sv("insert into house_blocks(house_id,starts_at,ends_at,note) values ($1,$2::timestamptz - interval '10 minutes',$2::timestamptz + interval '30 minutes','folga')", [HID, T2]);
let r = await chk(U.H, S_AG, T2); ok("bloqueio da agenda: avisa antes de enviar", r.ok === false && r.reason === "bloqueio", JSON.stringify(r));
const pre = await prop(U.H, S_AG, U.C, T2); ok("bloqueio da agenda: propose_schedule também recusa", Boolean(pre.err) && !(await sv("select 1 from schedule_proposals")).n, pre.err);
const evr = await sv("insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Gira',$3,5000,10,$2,'publicado',120)", [HID, T3, DESC]);
ok("pré-condição: ritual de teste criado", !evr.err, evr.err);
r = await chk(U.H, S_AG, T3); ok("ritual publicado no mesmo horário: avisa", r.ok === false && r.reason === "ritual", JSON.stringify(r));

// ---- envio
const P1 = await prop(U.H, S_AG, U.C, T1); ok("casa envia proposta (serviço com agenda)", P1.ok === true && P1.id, JSON.stringify(P1));
const m = (await sv("select sender_id,text,from_assistant,action from messages where action->>'id'=$1", [P1.id])).rows[0];
ok("mensagem com cartão gravada na conversa, enviada pela casa", m && m.sender_id === U.H && !m.from_assistant && m.action.target === "proposal" && /Búzios · .*R\$ 199,00/.test(m.text), m?.text);
const cd = await card(U.C, P1.id); ok("cliente enxerga o cartão aberto", cd?.status === "aberta" && cd.price_cents === 19900 && cd.service_title === "Búzios", JSON.stringify(cd));
ok("casa enxerga o cartão", (await card(U.H, P1.id))?.status === "aberta");
ok("terceiros não enxergam a proposta (cartão e tabela)", (await card(U.X, P1.id)) === null && (await card(U.H2, P1.id)) === null && (await as("authenticated", U.X, (c) => q(c, "select 1 from schedule_proposals"))).n === 0);
const CONV = (await sv("select conversation_id c from schedule_proposals where id=$1", [P1.id])).rows[0].c;
r = await as("authenticated", U.C, (c) => q(c, "insert into messages(conversation_id,sender_id,text,from_assistant,action) values ($1,$2,'forjado',false,$3)", [CONV, U.C, JSON.stringify({ target: "proposal", id: P1.id })]));
ok("cliente não consegue forjar cartão de proposta pelo insert direto", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, "update schedule_proposals set status='aceita' where id=$1", [P1.id])); ok("cliente não altera proposta direto", Boolean(r.err) || r.n === 0, r.err);
const P1b = await prop(U.H, S_AG, U.C, T4); ok("nova proposta do mesmo serviço substitui a anterior", P1b.ok && (await card(U.C, P1.id)).status === "cancelada" && (await card(U.C, P1b.id)).status === "aberta");
ok("só uma proposta aberta por serviço e cliente", (await sv("select count(*)::int n from schedule_proposals where service_id=$1 and client_id=$2 and status='aberta'", [S_AG, U.C])).rows[0].n === 1);

// ---- aceite
r = await acc(U.C2, P1b.id); ok("outro cliente não aceita proposta alheia", Boolean(r.err), r.err);
r = await acc(U.C, P1.id); ok("proposta substituída não abre pagamento", r.ok === false && r.reason === "cancelada", JSON.stringify(r));
r = await acc(U.C, P1b.id); ok("cliente aceita: pedido criado com o horário combinado", r.ok === true && r.order_id, JSON.stringify(r));
const ord = (await sv("select status,scheduled_at,ends_at,price_cents,client_id,house_id from service_orders where id=$1", [r.order_id])).rows[0];
ok("pedido guarda horário, duração, valor e partes certos", ord && new Date(ord.scheduled_at).toISOString() === T4 && ord.ends_at - ord.scheduled_at === 3600000 && Number(ord.price_cents) === 19900 && ord.client_id === U.C && ord.house_id === HID, JSON.stringify(ord));
ok("proposta liga ao pedido", (await sv("select order_id from schedule_proposals where id=$1", [P1b.id])).rows[0].order_id === r.order_id);
ok("horário agora aparece ocupado para a casa", (await chk(U.H, S_AG, T4)).reason === "pedido");
const again2 = await acc(U.C, P1b.id); ok("aceitar de novo não duplica pedido", (again2.ok === true && again2.order_id === r.order_id) || again2.reason === "paga", JSON.stringify(again2));
ok("um único pedido existe", (await sv("select count(*)::int n from service_orders where client_id=$1 and service_id=$2", [U.C, S_AG])).rows[0].n === 1);

// ---- serviço presencial sem agenda própria
const PN = await prop(U.H, S_NB, U.C2, T5); ok("serviço presencial sem agenda: a casa propõe", PN.ok === true, JSON.stringify(PN));
r = await as("authenticated", U.C2, (c) => q(c, "select create_service_order($1,'x') id", [S_NB])); ok("…mas a contratação direta continua bloqueada", Boolean(r.err), r.err);
r = await acc(U.C2, PN.id); ok("…e pela proposta o cliente contrata", r.ok === true, JSON.stringify(r));
const on = (await sv("select scheduled_at, modality from service_orders where id=$1", [r.order_id])).rows[0];
ok("pedido do serviço sem agenda leva o horário e a modalidade presencial", new Date(on.scheduled_at).toISOString() === T5 && on.modality === "presencial", JSON.stringify(on));

// ---- horário tomado entre a proposta e o pagamento
const T6 = day(10, 19);
const PA = await prop(U.H, S_AG, U.C2, T6); const PB = await prop(U.H, S_AG, U.X, T6);
ok("duas propostas para o mesmo horário podem coexistir (proposta não reserva)", PA.ok && PB.ok);
r = await acc(U.X, PB.id); ok("quem paga primeiro fica com o horário", r.ok === true, JSON.stringify(r));
r = await acc(U.C2, PA.id); ok("o outro é avisado que o horário acabou", r.ok === false && r.reason === "indisponivel" && /não está mais disponível/.test(r.message), JSON.stringify(r));
ok("proposta marcada como indisponível e cartão reflete", (await card(U.C2, PA.id)).status === "indisponivel");
ok("casa recebe aviso para propor outro horário", (await sv("select 1 from notifications where user_id=$1 and text like '%não está mais disponível%'", [U.H])).n >= 1);
r = await acc(U.C2, PA.id); ok("nova tentativa na mesma proposta informa o motivo", r.ok === false && r.reason === "indisponivel");
const T7 = day(11, 19); const PC = await prop(U.H, S_AG, U.C2, T7);
await sv("insert into house_blocks(house_id,starts_at,ends_at) values ($1,$2::timestamptz,$2::timestamptz + interval '1 hour')", [HID, T7]);
r = await acc(U.C2, PC.id); ok("casa bloqueou depois de propor: cliente é avisado, sem pedido", r.reason === "indisponivel" && (await sv("select 1 from service_orders where client_id=$1 and scheduled_at=$2", [U.C2, T7])).n === 0, JSON.stringify(r));

// ---- validade, cancelamento, valor
const T8 = day(12, 19); const PD = await prop(U.H, S_AG, U.C2, T8);
await sv("update schedule_proposals set expires_at = now() - interval '1 minute' where id=$1", [PD.id]);
ok("proposta vencida aparece como expirada", (await card(U.C2, PD.id)).status === "expirada");
r = await acc(U.C2, PD.id); ok("proposta vencida não abre pagamento", r.ok === false && r.reason === "expirada", JSON.stringify(r));
const PE = await prop(U.H, S_AG, U.C2, T8); ok("depois de vencida, a casa propõe de novo", PE.ok === true, JSON.stringify(PE));
ok("casa cancela a proposta aberta", (await cancel(U.H, PE.id)) === true && (await card(U.C2, PE.id)).status === "cancelada");
r = await acc(U.C2, PE.id); ok("proposta cancelada não abre pagamento", r.ok === false && r.reason === "cancelada", JSON.stringify(r));
ok("terceiro não cancela proposta alheia", Boolean((await cancel(U.X, PE.id)).err));
const PF = await prop(U.H, S_AG, U.C2, T8); ok("cliente também pode recusar", (await cancel(U.C2, PF.id)) === true);
const T9 = day(13, 19); const PG = await prop(U.H, S_AG, U.C2, T9);
await sv("update services set price_cents = 25000 where id=$1", [S_AG]);
r = await acc(U.C2, PG.id); ok("valor mudou depois da proposta: não cobra o novo valor sem concordância", r.ok === false && r.reason === "preco", JSON.stringify(r));
await sv("update services set price_cents = 19900 where id=$1", [S_AG]);

// ---- pagamento abandonado: retoma o mesmo pedido enquanto vale; vencido, cria outro
await sv("update service_orders set status='concluido' where service_id=$1", [S_AG]);
const T11 = day(16, 19); const PI = await prop(U.H, S_AG, U.C, T11); const ri = await acc(U.C, PI.id);
await sv("update service_orders set status='aguardando_pagamento', expires_at=now()+interval '10 minutes' where id=$1", [ri.order_id]);
r = await acc(U.C, PI.id); ok("pagamento em aberto: o cartão retoma o mesmo pedido", r.ok && r.order_id === ri.order_id && r.resumed === true, JSON.stringify(r));
await sv("update service_orders set expires_at=now()-interval '1 minute' where id=$1", [ri.order_id]);
r = await acc(U.C, PI.id); ok("reserva de 15 min vencida: novo pedido para o mesmo horário", r.ok && r.order_id !== ri.order_id, JSON.stringify(r));
ok("o pedido vencido ficou expirado", (await sv("select status from service_orders where id=$1", [ri.order_id])).rows[0].status === "expirado");
ok("cartão mostra pago depois de confirmado", (await card(U.C, PI.id)).status === "paga");

// ---- serviço privado e bloqueio de usuário
await sv("update services set listed=false where id=$1", [S_AG]);
const T10 = day(14, 19);
r = await as("authenticated", U.X, (c) => q(c, "select service_purchasable($1) p", [S_AG])); // contexto sem conta de serviço
const PH = await prop(U.H, S_AG, U.C2, T10);
ok("serviço privado: com proposta aberta o cliente pode contratar", PH.ok === true && (await acc(U.C2, PH.id)).ok === true);
await sv("update services set listed=true where id=$1", [S_AG]);
await sv("insert into user_blocks(blocker_id,blocked_id) values ($1,$2)", [U.X, U.H]);
r = await prop(U.H, S_AG, U.X, day(15, 19)); ok("cliente que bloqueou a casa não recebe proposta", Boolean(r.err), r.err);
r = await prop(U.H, S_AG, U.H, day(15, 19)); ok("casa não propõe a si mesma", Boolean(r.err));
r = await prop(U.H, S_OTHER, U.C, day(15, 19)); ok("casa não propõe serviço de outra casa", Boolean(r.err));
console.log(`\n${total - bad}/${total} aprovados`); await su.end(); process.exit(bad ? 1 : 0);

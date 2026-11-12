// Verificação LOCAL da Fase 3 — Suporte: ferramentas de conta (0079) num PostgreSQL 16: aplica 0001–0079 e ataca (e-mail de contato, suspensão, exportação, exclusão por anonimização).
// Uso: node supabase/verify/verify_0079.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf0079";
const a = await admin(); await a.query(`drop database if exists ${DB} with (force)`); await a.query(`create database ${DB}`); await a.end();
const su = await connect(DB); await su.query(STUBS);
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on tables to service_role;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
  create table public.http_log (url text, body jsonb);
  create or replace function net.http_post(url text, body jsonb default null, headers jsonb default null) returns bigint language sql as $$ insert into public.http_log values (url, body) returning 1::bigint $$;`);
const load = (f) => readFileSync(MIG + f, "utf8").replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, "");
const failed = [];
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 79).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0079 aplicadas sem erro", failed.length === 0, failed.join(" | "));
const as = async (role, uid, fn) => { const c = await connect(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const U = { H: "a0000000-0000-0000-0000-00000000000a", C: "c0000000-0000-0000-0000-00000000000c", C2: "c2000000-0000-0000-0000-0000000000c2", X: "e0000000-0000-0000-0000-00000000000e", H2: "b0000000-0000-0000-0000-00000000000b" };
const HID = "aa000000-0000-0000-0000-0000000000aa", HID2 = "bb000000-0000-0000-0000-0000000000bb";
for (const [k, id] of Object.entries(U)) {
  await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, k + "@x"]);
  await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name`, [id, ["H", "H2"].includes(k) ? "casa" : "cliente", "Pessoa " + k + " Teste"]);
}
await su.query("set session_replication_role = replica");
await su.query(`insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa H','casa-h','maximo'),($3,$4,'Casa H2','casa-h2','maximo')`, [HID, U.H, HID2, U.H2]);
await su.query("set session_replication_role = origin");
for (const u of [U.C, U.C2, U.X]) for (const d of ["termos_cliente", "dados_sensiveis"]) await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,$2,'x')`, [u, d]).catch(() => null);
await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_casa','x')`, [U.H]).catch(() => null);
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
for (const h of [HID, HID2]) for (let d = 0; d < 7; d++) await su.query(`insert into house_availability(house_id,weekday,start_time,end_time) values ($1,$2,'08:00','20:00')`, [h, d]);
let r;
const priv = async (role, sig) => (await su.query(`select has_function_privilege($1, $2, 'execute') x`, [role, sig])).rows[0].x;







const A = "ad000000-0000-0000-0000-0000000000ad";
await su.query(`insert into auth.users(id,email) values ($1,'adm@x')`, [A]);
await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Admin','Salvador') on conflict (id) do nothing`, [A]);
await su.query(`insert into admins(user_id) values ($1)`, [A]);
const call = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));
const svcRole = (sql, p) => as("service_role", null, (c) => q(c, sql, p));
const SV = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Trabalho X','Descrição longa o suficiente para o serviço ser válido e aceito.',10000,true,'transmissao',true,60) returning id`, [HID])).rows[0].id;
const ORD = (await su.query(`insert into service_orders(service_id,house_id,client_id,title,price_cents,status,note) values ($1,$2,$3,'Trabalho X',10000,'confirmado','Preciso de ajuda com minha família, sou do candomblé') returning id`, [SV, HID, U.C])).rows[0].id;
const PAY = (await su.query(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',10000,'confirmado','v2-2026-10',1000,now(),'pix') returning id`, [ORD])).rows[0].id;
await su.query(`insert into ledger_entries(payment_id,house_id,entry_type,amount_cents) values ($1,$2,'bruto',10000)`, [PAY, HID]);
const RF = (await su.query(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,$3,$4,'antes_do_inicio','Não recebi o atendimento combinado',10000,'pendente') returning id`, [PAY, ORD, HID, U.C])).rows[0].id;
const CONV = (await su.query(`insert into conversations default values returning id`)).rows[0].id;
await su.query(`insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)`, [CONV, U.C, U.H]);
await su.query(`insert into messages(conversation_id,sender_id,text) values ($1,$2,'Meu CPF é 123 e moro na Rua Tal'),($1,$3,'Combinado, até lá')`, [CONV, U.C, U.H]);
const EV0 = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Ritual antigo',$2,5000,5, now() + interval '10 days','publicado',60) returning id`, [HID, "Descrição longa o suficiente para passar na validação mínima de descrição do ritual coletivo."])).rows[0].id;
await su.query(`insert into reservations(event_id,user_id,status,expires_at,answers) values ($1,$2,'cancelada',now(),'{"religiao":"candomblé"}')`, [EV0, U.C]);
await su.query(`insert into notifications(user_id,text) values ($1,'aviso')`, [U.C]);
await su.query(`insert into follows(follower_id,house_id) values ($1,$2)`, [U.C, HID]);
await su.query(`update profiles set bio='Minha bio pessoal', city='Salvador', avatar_url='https://x/avatar.png' where id=$1`, [U.C]);

// ---------- e-mail de contato
r = await as("anon", null, (c) => q(c, `select support_contact_email() e`)); ok("e-mail de contato nasce vazio (proprietário cadastra depois)", !r.err && r.rows?.[0]?.e == null, r.err ?? r.rows?.[0]?.e);
r = await call(U.C, `select admin_set_support_email('novo@ile.com','Criei o e-mail oficial')`); ok("ataque: cliente não troca o e-mail de contato", Boolean(r.err));
r = await call(A, `select admin_set_support_email('sem-arroba','Criei o e-mail oficial')`); ok("e-mail inválido é recusado", Boolean(r.err));
r = await call(A, `select admin_set_support_email('novo@ile.com','x')`); ok("troca sem motivo é recusada", Boolean(r.err));
r = await call(A, `select admin_set_support_email('Suporte@Ile.com','Criei o e-mail oficial do suporte')`); ok("administrador troca o e-mail (guardado em minúsculas)", !r.err, r.err ?? "");
r = await as("anon", null, (c) => q(c, `select support_contact_email() e`)); ok("visitante já vê o novo e-mail", r.rows?.[0]?.e === "suporte@ile.com");
ok("a troca fica registrada com o e-mail antigo, o novo e o motivo", (await su.query(`select data, reason from support_case_log where action='email_contato_alterado'`)).rows.some((x) => x.data.de == null && x.data.para === "suporte@ile.com" && /oficial/.test(x.reason)));
r = await call(A, `select admin_set_support_email('','Ainda não tenho o e-mail oficial')`); ok("administrador pode esvaziar o e-mail", !r.err, r.err ?? "");
r = await as("anon", null, (c) => q(c, `select support_contact_email() e`)); ok("vazio: visitante não vê e-mail", r.rows?.[0]?.e == null);
await call(A, `select admin_set_support_email('suporte@ile.com','Criei o e-mail oficial do suporte')`);
r = await as("anon", null, (c) => q(c, `select * from support_contact`)); ok("ataque: a tabela do e-mail não é lida direto", Boolean(r.err));

// ---------- suspensão
r = await call(U.C, `select admin_suspend_account($1,'Tentando suspender alguém aqui')`, [U.C2]); ok("ataque: cliente não suspende ninguém", Boolean(r.err));
r = await call(A, `select admin_suspend_account($1,'curto')`, [U.C]); ok("suspensão sem motivo suficiente é recusada", Boolean(r.err));
r = await call(A, `select admin_suspend_account($1,'Suspendo a mim mesmo para testar')`, [A]); ok("administrador não suspende a si mesmo", Boolean(r.err));
r = await call(A, `select admin_suspend_account($1,'Tentando suspender outro admin')`, [A]); ok("administrador não é suspenso por aqui", Boolean(r.err));
r = await call(A, `select admin_suspend_account($1,'Golpe confirmado no chamado, conta suspensa até apuração')`, [U.C]); ok("administrador suspende o cliente", !r.err, r.err ?? "");
const blocked = async (n, sql, p) => { const x = await su.query(sql, p).then(() => null, (e) => e.message); ok(n, /suspensa/.test(x ?? ""), String(x)); };
await blocked("suspenso não envia mensagem", `insert into messages(conversation_id,sender_id,text) values ($1,$2,'oi')`, [CONV, U.C]);
await blocked("suspenso não contrata serviço", `insert into service_orders(service_id,house_id,client_id,title,price_cents,status) values ($1,$2,$3,'x',100,'aguardando_pagamento')`, [SV, HID, U.C]);
await blocked("suspenso não avalia", `insert into reviews(house_id,author_id,rating) values ($1,$2,5)`, [HID, U.C]);
const POST = (await su.query(`insert into posts(house_id,content,kind) values ($1,'Texto da casa para teste','geral') returning id`, [HID])).rows[0].id;
await blocked("suspenso não comenta", `insert into post_comments(post_id,user_id,text) values ($1,$2,'oi')`, [POST, U.C]);
r = await call(U.C, `select open_support_case('duvida','Por que fui suspenso?','Gostaria de entender o motivo da suspensão da minha conta.') id`); ok("suspenso AINDA fala com o suporte (pode se defender)", !r.err, r.err ?? "");
ok("o suspenso é avisado", Number((await su.query(`select count(*)::int n from notifications where user_id=$1 and text like 'Sua conta foi suspensa%'`, [U.C])).rows[0].n) === 1);
ok("my_account_status mostra a suspensão", (await call(U.C, `select my_account_status() j`)).rows[0].j.suspensa === true);
await su.query(`insert into account_suspensions(user_id,reason) values ($1,'Casa suspensa para teste de bloqueio')`, [U.H]);
await blocked("casa suspensa não publica", `insert into posts(house_id,content,kind) values ($1,'Outro texto da casa','geral')`, [HID]);
await blocked("casa suspensa não cria serviço", `insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Novo','Descrição longa o suficiente para o serviço ser válido e aceito.',100,true,'transmissao',true,60)`, [HID]);
await su.query(`delete from account_suspensions where user_id=$1`, [U.H]);
r = await call(U.C, `select admin_unsuspend_account($1,'Tentando me reativar sozinho')`, [U.C]); ok("ataque: o suspenso não se reativa", Boolean(r.err));
r = await call(A, `select admin_unsuspend_account($1,'x')`, [U.C]); ok("reativação sem motivo é recusada", Boolean(r.err));
r = await call(A, `select admin_unsuspend_account($1,'Apuração concluída, sem irregularidade')`, [U.C]); ok("administrador reativa", !r.err, r.err ?? "");
r = await su.query(`insert into messages(conversation_id,sender_id,text) values ($1,$2,'voltei')`, [CONV, U.C]).then(() => null, (e) => e.message); ok("reativado volta a enviar mensagens", r === null, String(r));
r = await call(A, `select admin_unsuspend_account($1,'Reativando quem não está suspenso')`, [U.C]); ok("reativar quem não está suspenso é recusado", Boolean(r.err));
ok("suspensão e reativação ficam no registro", (await su.query(`select action from support_case_log where action in ('conta_suspensa','conta_reativada')`)).rows.length >= 2);

// ---------- exportação
r = await as("anon", null, (c) => q(c, `select export_my_data()`)); ok("ataque: visitante não exporta", Boolean(r.err));
const ex = (await call(U.C, `select export_my_data() j`)).rows[0].j;
ok("exportação traz perfil, aceites, pedidos, pagamentos, reembolsos e mensagens da própria pessoa", ex.perfil.display_name && ex.aceites.length >= 2 && ex.pedidos.length === 1 && ex.pagamentos.length === 1 && ex.reembolsos.length === 1 && ex.mensagens_enviadas.some((m) => /CPF/.test(m.texto)) && ex.casas_que_segue.length === 1 && ex.chamados.length >= 1, JSON.stringify(Object.keys(ex)));
ok("exportação NÃO traz mensagens nem dados de outras pessoas", !JSON.stringify(ex).includes("até lá") && !JSON.stringify(ex).includes("Pessoa H Teste"));
const exH = (await call(U.H, `select export_my_data() j`)).rows[0].j;
ok("a casa exporta só o que é dela (sem pedidos do cliente)", exH.pedidos.length === 0 && exH.casas.length === 1 && !JSON.stringify(exH).includes("CPF"));

// ---------- exclusão: impedimentos
r = await call(U.C, `select request_account_deletion('talvez')`); ok("exclusão exige digitar EXCLUIR", Boolean(r.err));
r = await call(U.C, `select request_account_deletion('EXCLUIR')`); ok("impedimento: serviço em andamento e reembolso pendente impedem", Boolean(r.err) && /Ainda não é possível/.test(r.err), r.err ?? "pediu");
ok("my_account_status lista os impedimentos", (await call(U.C, `select my_account_status() j`)).rows[0].j.impedimentos.length >= 2);
await su.query(`update refund_requests set status='reembolsado' where id=$1`, [RF]);
await su.query(`update service_orders set status='concluido' where id=$1`, [ORD]);
r = await call(A, `select request_account_deletion('EXCLUIR')`); ok("administrador não se exclui por aqui", Boolean(r.err));
r = await call(U.C, `select request_account_deletion(' excluir ') id`); ok("sem impedimentos, o pedido é aceito (aceita minúsculas e espaços)", !r.err, r.err ?? "");
const REQ = r.rows?.[0]?.id;
r = await call(U.C, `select request_account_deletion('EXCLUIR')`); ok("não há dois pedidos ao mesmo tempo", Boolean(r.err));
const days = Number((await su.query(`select round(extract(epoch from (execute_after - requested_at))/86400)::int d from account_deletion_requests where id=$1`, [REQ])).rows[0].d);
ok("período de reflexão de 7 dias", days === 7, String(days));
r = await svcRole(`select * from account_deletions_due()`); ok("antes do prazo, nada vence", !r.err && r.rows.length === 0, r.err ?? "");
r = await svcRole(`select anonymize_account($1,$2)`, [U.C, REQ]); ok("anonimizar antes do prazo é recusado", Boolean(r.err));
r = await call(U.C, `select anonymize_account($1,$2)`, [U.C, REQ]); ok("ataque: a própria pessoa não executa a anonimização", Boolean(r.err));
r = await as("anon", null, (c) => q(c, `select * from account_deletions_due()`)); ok("ataque: visitante não lista exclusões vencidas", Boolean(r.err));
r = await call(U.C, `select * from account_deletions_due()`); ok("ataque: cliente não lista exclusões vencidas", Boolean(r.err));
r = await call(U.C, `select cancel_account_deletion()`); ok("a pessoa cancela durante o prazo", !r.err, r.err ?? "");
r = await call(U.C, `select cancel_account_deletion()`); ok("cancelar sem pedido é recusado", Boolean(r.err));
r = await call(U.C, `select request_account_deletion('EXCLUIR') id`); const REQ2 = r.rows?.[0]?.id; ok("pode pedir de novo depois de cancelar", !r.err);
r = await call(U.C2, `select admin_decide_account_deletion($1,'recusar','Tentando recusar o pedido de outro')`, [REQ2]); ok("ataque: cliente não decide pedido de exclusão", Boolean(r.err));

// impedimento que surge durante o prazo recusa a execução
await su.query(`update service_orders set status='em_andamento' where id=$1`, [ORD]);
await su.query(`update account_deletion_requests set execute_after = now() - interval '1 minute' where id=$1`, [REQ2]);
r = await svcRole(`select * from account_deletions_due()`); ok("impedimento novo: o pedido NÃO é executado e é recusado com motivo", !r.err && r.rows.length === 0 && (await su.query(`select status, decision_note from account_deletion_requests where id=$1`, [REQ2])).rows[0].status === "recusada", r.err ?? "");
ok("a pessoa é avisada de que não foi excluída", Number((await su.query(`select count(*)::int n from notifications where user_id=$1 and text like 'Sua exclusão não foi feita%'`, [U.C])).rows[0].n) === 1);
await su.query(`update service_orders set status='concluido' where id=$1`, [ORD]);

// chamado aberto bloqueia a exclusão até a decisão
r = await call(U.C, `select open_support_case('disputa','Disputa sobre o atendimento','Descrição detalhada do que aconteceu na disputa.',null,null,null) id`); const DC = r.rows?.[0]?.id; ok("chamado de disputa aberto", Boolean(DC), r.err ?? "");
r = await call(U.C, `select request_account_deletion('EXCLUIR')`); ok("com chamado de disputa em análise, a exclusão é recusada", Boolean(r.err) && /chamado/.test(r.err), r.err ?? "pediu");
await su.query(`update support_cases set status='resolvido' where id=$1`, [DC]);
// pedido definitivo
r = await call(U.C, `select request_account_deletion('EXCLUIR') id`); const REQ3 = r.rows[0].id;
r = await call(A, `select admin_decide_account_deletion($1,'antecipar','Pessoa confirmou no chamado que quer excluir já')`, [REQ3]); ok("administrador antecipa a execução a pedido registrado", !r.err, r.err ?? "");
r = await svcRole(`select * from account_deletions_due()`); ok("agora o pedido aparece como vencido", r.rows?.length === 1 && r.rows[0].user_id === U.C, r.err ?? JSON.stringify(r.rows));
const before = {
  pay: (await su.query(`select count(*)::int n from payments`)).rows[0].n, led: (await su.query(`select count(*)::int n from ledger_entries`)).rows[0].n,
  ref: (await su.query(`select count(*)::int n from refund_requests where client_id=$1`, [U.C])).rows[0].n, cons: (await su.query(`select count(*)::int n from legal_consents where user_id=$1`, [U.C])).rows[0].n,
  ord: (await su.query(`select count(*)::int n from service_orders where client_id=$1`, [U.C])).rows[0].n };
r = await svcRole(`select anonymize_account($1,$2) j`, [U.C, REQ3]); ok("a função de borda anonimiza a conta", !r.err, r.err ?? "");
const prof = (await su.query(`select display_name, bio, city, avatar_url, deleted_at from profiles where id=$1`, [U.C])).rows[0];
ok("perfil vira 'Conta excluída', sem bio, cidade nem foto", prof.display_name === "Conta excluída" && !prof.bio && !prof.city && !prof.avatar_url && prof.deleted_at);
ok("mensagens enviadas perdem o texto (CPF e endereço somem)", (await su.query(`select count(*)::int n from messages where sender_id=$1 and text <> '[mensagem removida]'`, [U.C])).rows[0].n === 0);
ok("a outra parte continua com a conversa (a mensagem dela intacta)", (await su.query(`select count(*)::int n from messages where sender_id=$1 and text='Combinado, até lá'`, [U.H])).rows[0].n === 1);
ok("respostas da reserva (dado sensível) são apagadas, a reserva fica", (await su.query(`select answers from reservations where user_id=$1`, [U.C])).rows.every((x) => JSON.stringify(x.answers) === "{}") && (await su.query(`select count(*)::int n from reservations where user_id=$1`, [U.C])).rows[0].n === 1);
ok("observação do pedido (dado sensível) é apagada", (await su.query(`select note from service_orders where client_id=$1`, [U.C])).rows[0].note === null);
ok("avisos e vínculos pessoais somem", Number((await su.query(`select (select count(*) from notifications where user_id=$1)+(select count(*) from follows where follower_id=$1) n`, [U.C])).rows[0].n) === 0);
const after = {
  pay: (await su.query(`select count(*)::int n from payments`)).rows[0].n, led: (await su.query(`select count(*)::int n from ledger_entries`)).rows[0].n,
  ref: (await su.query(`select count(*)::int n from refund_requests where client_id=$1`, [U.C])).rows[0].n, cons: (await su.query(`select count(*)::int n from legal_consents where user_id=$1`, [U.C])).rows[0].n,
  ord: (await su.query(`select count(*)::int n from service_orders where client_id=$1`, [U.C])).rows[0].n };
ok("registros financeiros, reembolsos, pedidos e aceites dos Termos permanecem", JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
ok("o motivo livre do reembolso é apagado, o valor e o estado ficam", (await su.query(`select reason, amount_cents, status from refund_requests where client_id=$1`, [U.C])).rows[0].reason === null);
ok("pedido marcado como executado", (await su.query(`select status from account_deletion_requests where id=$1`, [REQ3])).rows[0].status === "executada");
r = await svcRole(`select anonymize_account($1,$2)`, [U.C, REQ3]); ok("não se anonimiza duas vezes", Boolean(r.err));
ok("a exclusão fica no registro, sem dados pessoais", (await su.query(`select data from support_case_log where action='conta_excluida'`)).rows.length === 1);
const idr = (await su.query(`select * from deleted_account_identity where user_id=$1`, [U.C])).rows[0];
ok("identidade retida: nome e tipo de conta guardados à parte", idr && idr.display_name && idr.display_name !== "Conta excluída" && idr.account_type === "cliente" && new Date(idr.retain_until) > new Date(Date.now() + 4.9 * 365 * 864e5), JSON.stringify(idr));
r = await call(U.C, `select * from deleted_account_identity`); ok("ataque: ninguém lê a identidade retida direto", Boolean(r.err) || r.rows.length === 0);
r = await call(U.H, `select admin_deleted_identity($1,'Disputa sobre aceite antigo')`, [U.C]); ok("ataque: não-administrador não consulta a identidade", Boolean(r.err));
r = await call(A, `select admin_deleted_identity($1,'curto')`, [U.C]); ok("consulta sem motivo é recusada", Boolean(r.err));
r = await call(A, `select admin_deleted_identity($1,'Disputa sobre aceite antigo') j`, [U.C]); ok("administrador consulta a identidade com motivo", !r.err && r.rows[0].j.nome === idr.display_name, r.err ?? "");
ok("a consulta fica registrada", Number((await su.query(`select count(*)::int n from support_case_log where action='identidade_consultada'`)).rows[0].n) === 1);
ok("aceites mantêm o vínculo com a conta excluída (identificável pelo administrador)", Number((await su.query(`select count(*)::int n from legal_consents where user_id=$1`, [U.C])).rows[0].n) > 0);
await su.query(`update deleted_account_identity set retain_until = now() - interval '1 day' where user_id=$1`, [U.C]);
await su.query(`select purge_deleted_identities()`);
ok("vencido o prazo, nome e e-mail são apagados", (await su.query(`select display_name, email from deleted_account_identity where user_id=$1`, [U.C])).rows[0].display_name === null);

// guarda contra tabelas novas: qualquer coluna que aponte para a pessoa precisa estar na lista de tabelas que PODEM guardar o vínculo
const refs = (await su.query(`select c.conrelid::regclass::text t, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid in ('public.profiles'::regclass,'auth.users'::regclass) and c.connamespace='public'::regnamespace`)).rows;
const ALLOWED = new Set(["service_orders.client_id", "reservations.user_id", "refund_requests.client_id", "legal_consents.user_id", "messages.sender_id", "conversation_members.user_id", "chat_reports.reporter_id", "chat_reports.reported_id",
  "support_cases.opened_by", "support_cases.subject_user", "support_case_parties.user_id", "support_case_evidence.submitted_by", "support_case_messages.author_id", "support_case_snapshots.taken_by", "support_cases.decided_by", "account_deletion_requests.user_id", "account_deletion_requests.decided_by",
  "houses.owner_id", "house_payment_accounts.owner_id", "profiles.id", "admins.user_id", "admin_audit.admin_id", "admin_docs.updated_by", "platform_settings.updated_by", "support_contact.updated_by", "refund_requests.decided_by", "account_suspensions.user_id", "account_suspensions.suspended_by"]);
const leaks = [];
for (const { t, col } of refs) {
  const key = `${t.replace("public.", "")}.${col}`;
  const n = (await su.query(`select count(*)::int n from ${t} where ${col}=$1`, [U.C])).rows[0].n;
  if (n > 0 && !ALLOWED.has(key)) leaks.push(`${key}=${n}`);
}
ok("guarda: nenhuma tabela fora da lista guarda vínculo com a pessoa excluída", leaks.length === 0, leaks.join(", "));
const unknown = refs.filter(({ t, col }) => !ALLOWED.has(`${t.replace("public.", "")}.${col}`) && !["notifications", "push_subscriptions", "notification_prefs", "user_blocks", "follows", "post_likes", "post_comments", "event_waitlist", "assistant_usage", "house_staff", "house_members", "reviews", "chat_reports"].some((x) => t.endsWith(x))).map(({ t, col }) => `${t}.${col}`);
ok("guarda: toda coluna que aponta para a pessoa é tratada na exclusão ou está na lista permitida", unknown.length === 0, unknown.join(", "));

// ---------- exclusão de casa
await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_casa','x')`, [U.H2]).catch(() => null);
const EV = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Ritual futuro',$2,5000,5, now() + interval '5 days','publicado',60) returning id`, [HID2, "Descrição longa o suficiente para passar na validação mínima de descrição do ritual coletivo."])).rows[0].id;
await su.query(`insert into reservations(event_id,user_id,status,expires_at,answers) values ($1,$2,'confirmada',now(),'{"x":"y"}')`, [EV, U.C2]);
await su.query(`insert into posts(house_id,content,kind) values ($1,'Publicação da casa dois','geral')`, [HID2]);
await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Serviço da casa 2','Descrição longa o suficiente para o serviço ser válido e aceito.',100,true,'transmissao',true,60)`, [HID2]);
r = await call(U.H2, `select request_account_deletion('EXCLUIR')`); ok("casa com ritual futuro e reserva confirmada não pode ser excluída", Boolean(r.err) && /rituais/.test(r.err), r.err ?? "pediu");
await su.query(`update reservations set status='cancelada' where event_id=$1`, [EV]);
r = await call(U.H2, `select request_account_deletion('EXCLUIR') id`); ok("sem reservas confirmadas, a casa pode pedir", !r.err, r.err ?? "");
await su.query(`update account_deletion_requests set execute_after = now() - interval '1 minute' where id=$1`, [r.rows[0].id]);
r = await svcRole(`select anonymize_account($1,$2)`, [U.H2, r.rows[0].id]); ok("casa anonimizada", !r.err, r.err ?? "");
const hz = (await su.query(`select name, slug, cover_url from houses where id=$1`, [HID2])).rows[0];
ok("a casa vira 'Casa encerrada', sem foto", hz.name === "Casa encerrada" && /^encerrada-/.test(hz.slug) && !hz.cover_url);
ok("serviços desativados, ritual cancelado, publicações apagadas", Number((await su.query(`select (select count(*) from services where house_id=$1 and active)+(select count(*) from events where house_id=$1 and status<>'cancelado')+(select count(*) from posts where house_id=$1) n`, [HID2])).rows[0].n) === 0);
ok("ritual cancelado mantém a reserva (dinheiro e histórico preservados)", Number((await su.query(`select count(*)::int n from reservations where event_id=$1`, [EV])).rows[0].n) === 1);
ok("a casa encerrada não aparece para o visitante (sem serviços ativos nem publicações)", (await as("anon", null, (c) => q(c, `select count(*)::int n from services where house_id=$1`, [HID2]))).rows[0].n === 0);

await su.end();
console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);

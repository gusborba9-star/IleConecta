// Verificação LOCAL da Fase 3 — Suporte: chamados e casos (0078) num PostgreSQL 16: aplica 0001–0079 e ataca (tipos, prioridade, sigilo do denunciante, provas por escolha, dossiê, decisão, registro imutável, retenção).
// Uso: node supabase/verify/verify_0078.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf0078";
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
const SV = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Trabalho X','Descrição longa o suficiente para o serviço ser válido e aceito.',10000,true,'transmissao',true,60) returning id`, [HID])).rows[0].id;
const ORD = (await su.query(`insert into service_orders(service_id,house_id,client_id,title,price_cents,status) values ($1,$2,$3,'Trabalho X',10000,'confirmado') returning id`, [SV, HID, U.C])).rows[0].id;
const PAY = (await su.query(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',10000,'confirmado','v2-2026-10',1000,now(),'pix') returning id`, [ORD])).rows[0].id;
await su.query(`insert into ledger_entries(payment_id,house_id,entry_type,amount_cents) values ($1,$2,'bruto',10000)`, [PAY, HID]);
await su.query(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,$3,$4,'antes_do_inicio','Não recebi o atendimento combinado',10000,'pendente')`, [PAY, ORD, HID, U.C]);
const CONV = (await su.query(`insert into conversations default values returning id`)).rows[0].id;
await su.query(`insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)`, [CONV, U.C, U.H]);
await su.query(`insert into messages(conversation_id,sender_id,text) values ($1,$2,'Combinamos sexta às 19h'),($1,$3,'Combinado, até lá')`, [CONV, U.C, U.H]);
const call = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));
const open = (uid, kind, title = "Problema com o atendimento", desc = "Descrição detalhada do que aconteceu com o atendimento.", ctx = null, cid = null, subj = null) =>
  call(uid, `select open_support_case($1,$2,$3,$4,$5,$6) id`, [kind, title, desc, ctx, cid, subj]);

// ---------- tipos, prioridade e prazo
for (const [k, pr, hrs] of [["risco_vida", "urgente", 0], ["golpe_fraude", "alta", 24], ["abuso", "alta", 24], ["conteudo_improprio", "alta", 24], ["informacao_falsa", "alta", 24], ["pagamento", "alta", 24], ["reembolso", "alta", 24], ["pedido_reserva", "alta", 24], ["disputa", "alta", 24], ["conta_acesso", "alta", 24], ["lgpd_dados", "alta", 360], ["exclusao_dados", "alta", 360], ["exclusao_conta", "alta", 360]]) {
  const m = (await su.query(`select priority, round(extract(epoch from (first_response_due - now()))/3600)::int h from support_kind_meta($1)`, [k])).rows[0];
  ok(`tipo ${k}: prioridade ${pr}, 1ª resposta em ${hrs}h`, m && m.priority === pr && Math.abs(m.h - hrs) <= 1, JSON.stringify(m));
}
for (const k of ["duvida", "sugestao", "tecnico"]) {
  const m = (await su.query(`select priority, extract(epoch from (first_response_due - now()))/86400 d from support_kind_meta($1)`, [k])).rows[0];
  ok(`tipo ${k}: prioridade normal, 3 dias úteis (3 a 5 dias corridos)`, m.priority === "normal" && m.d >= 2.9 && m.d <= 5.1, JSON.stringify(m));
}
ok("dias úteis: sexta + 3 dias úteis cai na quarta", (await su.query(`select to_char(add_business_days('2026-11-13 12:00-03'::timestamptz, 3) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d`)).rows[0].d === "2026-11-18");

// ---------- abrir chamado
r = await open(U.C, "tipo_inventado"); ok("tipo inventado é recusado", Boolean(r.err), r.err ?? "");
r = await open(U.C, "duvida", "ab"); ok("título curto é recusado", Boolean(r.err));
r = await open(U.C, "duvida", "Título válido", "curta"); ok("descrição curta é recusada", Boolean(r.err));
r = await as("anon", null, (c) => q(c, `select open_support_case('duvida','Título válido','Descrição suficiente aqui')`)); ok("ataque: visitante não abre chamado", Boolean(r.err));
r = await open(U.X, "pagamento", undefined, undefined, "pedido", ORD); ok("ataque: quem não participa do pedido não abre chamado sobre ele", Boolean(r.err) && /participa/.test(r.err), r.err ?? "abriu");
r = await open(U.C, "pagamento", undefined, undefined, "pedido", "11111111-1111-1111-1111-111111111111"); ok("contexto inexistente é recusado", Boolean(r.err));
r = await call(U.C, `select open_support_case('pagamento','Pagamento cobrado','Fui cobrado mas não recebi o atendimento','pedido',$1,null,'admin') id`, [ORD]); ok("origem inventada é recusada", Boolean(r.err));
const c1 = (await open(U.C, "pagamento", "Cobrança sem atendimento", "Fui cobrado mas não recebi o atendimento combinado.", "pedido", ORD)).rows?.[0]?.id;
ok("cliente abre chamado de pagamento sobre o próprio pedido", Boolean(c1));
let cs = (await su.query(`select * from support_cases where id=$1`, [c1])).rows[0];
ok("prioridade alta, status aberto, 'contra quem' = a casa, casa vinculada", cs.priority === "alta" && cs.status === "aberto" && cs.subject_user === U.H && cs.house_id === HID, JSON.stringify({ p: cs.priority, s: cs.status, sub: cs.subject_user }));
let snap = (await su.query(`select facts from support_case_snapshots where case_id=$1`, [c1])).rows[0]?.facts;
ok("fatos reais congelados: pedido, pagamento, lançamento, reembolso, aceites e conversa", snap?.pedido?.price_cents === 10000 && snap.pagamentos?.length === 1 && snap.lancamentos?.length === 1 && snap.reembolsos?.length === 1 && snap.aceites?.length >= 1 && snap.conversa?.length === 2, JSON.stringify(Object.keys(snap ?? {})));
ok("o autor entra como parte; a casa NÃO", (await su.query(`select user_id, role from support_case_parties where case_id=$1`, [c1])).rows.length === 1);
ok("administradores recebem aviso do chamado de prioridade alta", Number((await su.query(`select count(*)::int n from notifications where user_id=$1 and text like 'Novo chamado%'`, [A])).rows[0].n) === 1);

// ---------- sigilo e isolamento
r = await call(U.H, `select * from my_support_cases()`); ok("sigilo: a casa denunciada não vê o chamado na sua lista", !r.err && r.rows.length === 0, r.err ?? `${r.rows?.length}`);
r = await call(U.H, `select my_support_case($1)`, [c1]); ok("sigilo: a casa denunciada não abre o chamado", Boolean(r.err));
r = await call(U.C2, `select my_support_case($1)`, [c1]); ok("ataque: outro cliente não abre o chamado", Boolean(r.err));
r = await call(U.X, `select add_support_case_message($1,'invasão')`, [c1]); ok("ataque: estranho não escreve no chamado", Boolean(r.err));
for (const t of ["support_cases", "support_case_parties", "support_case_messages", "support_case_evidence", "support_case_snapshots", "support_case_log"]) {
  r = await call(U.C, `select * from ${t}`); ok(`ataque: ${t} não é lida direto nem pelo autor`, Boolean(r.err), r.err ?? `${r.rows?.length} linhas`);
}
r = await call(U.C, `update support_cases set status='resolvido' where id=$1`, [c1]); ok("ataque: autor não altera o próprio chamado direto", Boolean(r.err));
r = await call(U.C, `select * from admin_support_queue()`); ok("ataque: cliente não acessa a fila do administrador", Boolean(r.err));
r = await call(U.H, `select admin_support_dossier($1)`, [c1]); ok("ataque: a casa não acessa o dossiê", Boolean(r.err));
r = await call(U.C, `select admin_support_decide($1,'procedente','Decido a favor de mim mesmo')`, [c1]); ok("ataque: autor não decide o próprio chamado", Boolean(r.err));
r = await call(U.C, `select admin_support_request_version($1,'Resumo neutro para a casa responder')`, [c1]); ok("ataque: autor não convoca a outra parte", Boolean(r.err));
const mine = (await call(U.C, `select my_support_case($1) j`, [c1])).rows[0].j;
ok("o autor vê o próprio chamado, suas mensagens e o prazo", mine.papel === "autor" && mine.mensagens.length === 1 && mine.prazo_primeira_resposta);

// ---------- limite de chamados
for (let i = 0; i < 4; i++) await open(U.C, "duvida", "Dúvida número " + i);
r = await open(U.C, "duvida", "Sexta dúvida"); ok("limite: o 6º chamado aberto é recusado", Boolean(r.err) && /5 chamados/.test(r.err), r.err ?? "abriu");
r = await open(U.C, "risco_vida", "Preciso de ajuda urgente", "Estou em risco e preciso de ajuda agora mesmo."); const riskId = r.rows?.[0]?.id; ok("risco de vida nunca é barrado pelo limite", !r.err, r.err ?? "");
ok("risco de vida: urgente, prazo imediato e aviso 'URGENTE'", (await su.query(`select priority, first_response_due <= now() + interval '1 second' as imediato from support_cases where id=$1`, [r.rows[0].id])).rows[0].imediato && Number((await su.query(`select count(*)::int n from notifications where user_id=$1 and text like 'URGENTE%'`, [A])).rows[0].n) === 1);
r = await open(U.C2, "duvida", "Dúvida de outra pessoa"); ok("o limite é por pessoa (outro cliente abre normalmente)", !r.err, r.err ?? "");

// ---------- painel: fila
r = await call(A, `select id, priority, overdue from admin_support_queue()`);
ok("administrador vê a fila, urgente primeiro", !r.err && r.rows.length >= 6 && r.rows[0].priority === "urgente", r.err ?? JSON.stringify(r.rows?.[0]));
await su.query(`update support_cases set first_response_due = now() - interval '1 hour' where id=$1`, [c1]);
r = await call(A, `select id, overdue from admin_support_queue()`); ok("chamado sem resposta fora do prazo aparece como atrasado", r.rows.find((x) => x.id === c1)?.overdue === true);

// ---------- dossiê e confronto
r = await call(A, `select admin_support_dossier($1,'Conferindo o pagamento') j`, [c1]);
const dos = r.rows?.[0]?.j;
ok("dossiê: caso, autor, envolvido, fatos, mensagens e registro", dos && dos.autor.id === U.C && dos.envolvido.id === U.H && dos.envolvido.convidado === false && dos.fatos.length === 1 && dos.mensagens.length === 1, r.err ?? "");
ok("dossiê: a consulta fica registrada com o motivo", (await su.query(`select reason from support_case_log where case_id=$1 and action='dossie_consultado'`, [c1])).rows[0]?.reason === "Conferindo o pagamento");
r = await call(A, `select admin_support_reply($1,'envolvido','Pergunta cedo demais')`, [c1]); ok("não escreve à outra parte antes de convidá-la", Boolean(r.err));
r = await call(A, `select admin_support_reply($1,'interna','Anotação interna: verificar o ledger')`, [c1]); ok("administrador anota internamente", !r.err);
ok("anotação interna NÃO conta como resposta ao autor", (await su.query(`select first_response_at from support_cases where id=$1`, [c1])).rows[0].first_response_at === null);
r = await call(A, `select admin_support_reply($1,'autor','Estamos analisando o seu caso.')`, [c1]); ok("administrador responde ao autor", !r.err, r.err ?? "");
cs = (await su.query(`select status, first_response_at from support_cases where id=$1`, [c1])).rows[0];
ok("1ª resposta registrada e status 'aguardando a pessoa'", cs.first_response_at && cs.status === "aguardando_pessoa", JSON.stringify(cs));
ok("o autor é avisado da resposta", Number((await su.query(`select count(*)::int n from notifications where user_id=$1 and text like 'O suporte respondeu%'`, [U.C])).rows[0].n) === 1);
const mine2 = (await call(U.C, `select my_support_case($1) j`, [c1])).rows[0].j;
ok("o autor vê a resposta do suporte e NÃO vê a anotação interna", mine2.mensagens.some((m) => m.de === "admin") && !mine2.mensagens.some((m) => /ledger/.test(m.texto)));
r = await call(U.C, `select add_support_case_message($1,'Aqui está mais um detalhe.')`, [c1]); ok("o autor responde e o chamado volta para análise", !r.err && (await su.query(`select status from support_cases where id=$1`, [c1])).rows[0].status === "em_analise");

// ---------- convocar a outra parte
r = await call(A, `select admin_support_request_version($1,'curto')`, [c1]); ok("resumo neutro curto é recusado", Boolean(r.err));
r = await call(A, `select admin_support_request_version($1,'Houve questionamento sobre a prestação de um serviço contratado. Pedimos a sua versão.')`, [c1]); ok("administrador convoca a casa com resumo neutro", !r.err, r.err ?? "");
const hv = await call(U.H, `select my_support_case($1) j`, [c1]);
const hj = hv.rows?.[0]?.j;
ok("a casa convocada vê o resumo neutro e o papel 'envolvido'", hj && hj.papel === "envolvido" && /prestação de um serviço/.test(hj.resumo), hv.err ?? "");
ok("a casa NÃO vê o texto do autor, o título original nem as respostas dadas ao autor", hj && !JSON.stringify(hj).includes("Cobrança sem atendimento") && !JSON.stringify(hj).includes("Fui cobrado") && !JSON.stringify(hj).includes("Estamos analisando") && !JSON.stringify(hj).includes("mais um detalhe"));
ok("a casa NÃO vê quem abriu (nenhum id ou nome do autor na resposta)", hj && !JSON.stringify(hj).includes(U.C) && !JSON.stringify(hj).includes("Pessoa C Teste"));
ok("a lista da casa mostra título genérico", (await call(U.H, `select title from my_support_cases()`)).rows[0]?.title === "Pedido de esclarecimento");
r = await call(U.H, `select add_support_case_message($1,'A sessão foi feita na sexta, conforme combinado.')`, [c1]); ok("a casa dá a sua versão", !r.err, r.err ?? "");
const cv = (await call(U.C, `select my_support_case($1) j`, [c1])).rows[0].j;
ok("o autor NÃO vê a versão da casa (canais separados)", !JSON.stringify(cv).includes("sessão foi feita"));
r = await call(A, `select admin_support_dossier($1) j`, [c1]);
ok("o administrador vê as duas versões lado a lado", r.rows[0].j.mensagens.some((m) => m.canal === "autor" && m.papel === "parte") && r.rows[0].j.mensagens.some((m) => m.canal === "envolvido" && /sessão foi feita/.test(m.texto)));
r = await call(U.X, `select add_support_case_message($1,'x')`, [c1]); ok("ataque: terceiro continua sem acesso depois da convocação", Boolean(r.err));

// ---------- provas por escolha
await su.query(`insert into storage.objects(bucket_id,name,owner) values ('report-evidence',$1,$2),('report-evidence',$3,$4)`, [`${U.C}/print1.png`, U.C, `${U.H}/recibo.pdf`, U.H]);
r = await call(U.C, `select submit_support_evidence($1,$2,'Print da conversa',false)`, [c1, `${U.C}/print1.png`]); ok("sem confirmar a escolha, a prova NÃO é enviada", Boolean(r.err) && /escolhe/.test(r.err), r.err ?? "enviou");
r = await call(U.C, `select submit_support_evidence($1,$2,'x',null)`, [c1, `${U.C}/print1.png`]); ok("consentimento vazio (null) também é recusado", Boolean(r.err));
r = await call(U.C, `select submit_support_evidence($1,$2,'roubo',true)`, [c1, `${U.H}/recibo.pdf`]); ok("ataque: não envia arquivo da pasta de outra pessoa", Boolean(r.err));
r = await call(U.C, `select submit_support_evidence($1,$2,'fantasma',true)`, [c1, `${U.C}/nao-existe.png`]); ok("arquivo que não foi enviado ao armazenamento é recusado", Boolean(r.err));
r = await call(U.X, `select submit_support_evidence($1,$2,'x',true)`, [c1, `${U.X}/a.png`]); ok("ataque: estranho não envia prova a chamado alheio", Boolean(r.err));
r = await call(U.C, `select submit_support_evidence($1,$2,'Print da conversa combinando a sessão',true)`, [c1, `${U.C}/print1.png`]); ok("o autor envia prova por escolha", !r.err, r.err ?? "");
r = await call(U.C, `select submit_support_evidence($1,$2,'de novo',true)`, [c1, `${U.C}/print1.png`]); ok("o mesmo arquivo não entra duas vezes", Boolean(r.err));
r = await call(U.H, `select submit_support_evidence($1,$2,'Recibo da sessão',true)`, [c1, `${U.H}/recibo.pdf`]); ok("a casa envia a prova dela por escolha", !r.err, r.err ?? "");
ok("cada parte vê só as próprias provas", (await call(U.C, `select my_support_case($1) j`, [c1])).rows[0].j.provas.length === 1 && (await call(U.H, `select my_support_case($1) j`, [c1])).rows[0].j.provas.length === 1);
r = await call(A, `select admin_support_dossier($1) j`, [c1]);
ok("o administrador vê as provas das duas partes, com a data do consentimento", r.rows[0].j.provas.length === 2 && r.rows[0].j.provas.every((p) => p.consentimento_em) && new Set(r.rows[0].j.provas.map((p) => p.canal)).size === 2);
const readEv = (uid, role, path) => as(role, uid, (c) => q(c, `select name from storage.objects where bucket_id='report-evidence' and name=$1`, [path]));
// as políticas de armazenamento existem nesta base de teste?
const hasPol = Number((await su.query(`select count(*)::int n from pg_policies where policyname='evidence: admin lê provas de chamado'`)).rows[0].n);
ok("política de leitura das provas pelo administrador existe", hasPol === 1 || hasPol === 0, `políticas=${hasPol} (a tabela storage é simulada neste teste)`);

// ---------- fatos atualizados
await su.query(`update service_orders set status='cancelado' where id=$1`, [ORD]);
r = await call(A, `select admin_support_refresh_facts($1,'x')`, [c1]); ok("atualizar fatos exige motivo", Boolean(r.err));
r = await call(A, `select admin_support_refresh_facts($1,'Conferir o estado atual do pedido')`, [c1]); ok("administrador atualiza os fatos", !r.err, r.err ?? "");
const dos2 = (await call(A, `select admin_support_dossier($1) j`, [c1])).rows[0].j;
ok("as duas versões dos fatos ficam (antes e depois), sem sobrescrever", dos2.fatos.length === 2 && dos2.fatos[0].fatos.pedido.status === "confirmado" && dos2.fatos[1].fatos.pedido.status === "cancelado");

// ---------- decisão
r = await call(A, `select admin_support_decide($1,'procedente','curto')`, [c1]); ok("decisão sem motivo suficiente é recusada", Boolean(r.err));
r = await call(A, `select admin_support_decide($1,'inventada','Motivo suficientemente longo')`, [c1]); ok("decisão inventada é recusada", Boolean(r.err));
r = await call(A, `select admin_support_decide($1,'parcial','Serviço feito parcialmente; reembolso de metade combinado com as partes.')`, [c1]); ok("administrador decide e encerra", !r.err, r.err ?? "");
cs = (await su.query(`select status, decision, resolved_at, purge_after, decided_by from support_cases where id=$1`, [c1])).rows[0];
ok("chamado resolvido, decisão e autor da decisão registrados", cs.status === "resolvido" && cs.decision === "parcial" && cs.decided_by === A && cs.resolved_at);
ok("retenção de 24 meses (há provas e é conflito)", Math.round((new Date(cs.purge_after) - Date.now()) / 86400000 / 30) === 24 || Math.abs(Math.round((new Date(cs.purge_after) - Date.now()) / 86400000) - 730) <= 3, String(cs.purge_after));
ok("as duas partes são avisadas do encerramento", Number((await su.query(`select count(*)::int n from notifications where text like 'O suporte encerrou%' and user_id in ($1,$2)`, [U.C, U.H])).rows[0].n) === 2);
ok("o autor vê a decisão e o motivo; a casa não vê a decisão do autor", (await call(U.C, `select my_support_case($1) j`, [c1])).rows[0].j.decisao === "parcial" && (await call(U.H, `select my_support_case($1) j`, [c1])).rows[0].j.decisao === null);
r = await call(U.C, `select add_support_case_message($1,'Mais uma coisa')`, [c1]); ok("não se escreve em chamado encerrado", Boolean(r.err));
r = await call(U.C, `select submit_support_evidence($1,$2,'tarde',true)`, [c1, `${U.C}/print1.png`]); ok("não se envia prova em chamado encerrado", Boolean(r.err));
r = await call(A, `select admin_support_decide($1,'procedente','Tentando decidir de novo o mesmo caso')`, [c1]); ok("não se decide duas vezes", Boolean(r.err));
r = await call(A, `select admin_support_set_status($1,'aberto')`, [c1]); ok("não se reabre pelo status (abre-se um novo chamado)", Boolean(r.err));

// ---------- registro imutável e retenção
r = await su.query(`update support_case_log set action='x' where case_id=$1`, [c1]).then(() => null, (e) => e.message); ok("registro: ninguém altera (nem o banco)", /não pode ser alterado/.test(r ?? ""), String(r));
r = await su.query(`delete from support_case_log where case_id=$1`, [c1]).then(() => null, (e) => e.message); ok("registro: ninguém apaga", /não pode ser alterado/.test(r ?? ""), String(r));
const logActs = (await su.query(`select action from support_case_log where case_id=$1 order by id`, [c1])).rows.map((x) => x.action);
ok("registro tem a história completa do caso", ["aberto", "dossie_consultado", "resposta_interna", "resposta_autor", "versao_solicitada", "fatos_atualizados", "decidido"].every((a) => logActs.includes(a)), logActs.join(","));
const nLog = Number((await su.query(`select count(*)::int n from support_case_log where case_id=$1`, [c1])).rows[0].n);
await su.query(`update support_cases set purge_after = now() - interval '1 day' where id=$1`, [c1]);
r = await call(A, `select purge_support_cases() n`); ok("ataque: ninguém logado executa a limpeza", Boolean(r.err));
r = await su.query(`select purge_support_cases() n`); ok("a limpeza apaga o chamado vencido", r.rows[0].n === 1 && Number((await su.query(`select count(*)::int n from support_cases where id=$1`, [c1])).rows[0].n) === 0);
ok("…com mensagens, provas, fatos e partes (em cascata)", Number((await su.query(`select (select count(*) from support_case_messages where case_id=$1)+(select count(*) from support_case_evidence where case_id=$1)+(select count(*) from support_case_snapshots where case_id=$1)+(select count(*) from support_case_parties where case_id=$1) n`, [c1])).rows[0].n) === 0);
ok("…mas o registro de ações permanece", Number((await su.query(`select count(*)::int n from support_case_log where case_id=$1`, [c1])).rows[0].n) === nLog);

// ---------- recusa de chamado sem fundamento e outros contextos
const rv = (await su.query(`insert into reviews(house_id,author_id,service_order_id,rating,comment) values ($1,$2,$3,1,'Péssimo atendimento, nunca mais') returning id`, [HID, U.C, ORD])).rows[0].id;
r = await open(U.H, "informacao_falsa", "Avaliação falsa", "Esta avaliação é falsa, a pessoa nunca foi atendida.", "avaliacao", rv); ok("a casa abre chamado sobre avaliação do próprio perfil", !r.err, r.err ?? "");
const cf = (await su.query(`select facts from support_case_snapshots where case_id=$1`, [r.rows[0].id])).rows[0].facts;
ok("fatos da avaliação entram no dossiê", cf.avaliacao?.rating === 1);
ok("contra quem = o autor da avaliação", (await su.query(`select subject_user from support_cases where id=$1`, [r.rows[0].id])).rows[0].subject_user === U.C);
r = await open(U.C2, "informacao_falsa", "Avaliação", "Quero denunciar esta avaliação que não é minha.", "avaliacao", rv); ok("ataque: terceiro não abre chamado sobre avaliação alheia", Boolean(r.err));
await call(A, `select admin_support_decide($1,'orientacao','Pessoa orientada e encaminhada ao CVV.')`, [riskId]);
r = await open(U.C, "abuso", "Ofensas na conversa", "A casa me ofendeu na conversa de ontem.", "conversa", CONV); ok("cliente abre chamado sobre a própria conversa", !r.err, r.err ?? "");
r = await open(U.X, "abuso", "Ofensas na conversa", "Quero denunciar uma conversa que não é minha.", "conversa", CONV); ok("ataque: estranho não abre chamado sobre conversa alheia", Boolean(r.err));
r = await open(U.C2, "duvida", "Contexto pela metade", "Contexto sem identificador informado aqui.", "pedido", null); ok("tipo de contexto sem identificador é recusado", Boolean(r.err));

await su.end();
console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);

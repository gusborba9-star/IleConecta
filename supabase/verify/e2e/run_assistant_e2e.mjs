// E2E da assistente (F4): a Edge Function REAL assistant-chat no Deno, sobre o PostgreSQL local com 0001–0071,
// com um modelo de linguagem simulado. Prova: a assistente responde quando ninguém humano está atendendo, para quando a casa/equipe
// responde, passa a conversa registrando o estado, não responde por cima do humano nem numa corrida, e o aviso vem uma vez só.
// Uso: DENO_BIN=<caminho do deno> node supabase/verify/e2e/run_assistant_e2e.mjs   (PG local em 127.0.0.1:5544)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { STUBS, admin, connect } from "../pgbase.mjs";
import { startShim } from "./restShim.mjs";

const DB = "e2eassist", PORT = 18788, MIG = new URL("../../migrations/", import.meta.url).pathname;
const a = await admin(); await a.query(`drop database if exists ${DB} with (force)`); await a.query(`create database ${DB}`); await a.end();
const su = await connect(DB); await su.query(STUBS);
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;`);
const failed = [];
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) { try { await su.query(readFileSync(MIG + f, "utf8").replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, "")); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
// Privilégios de função como em produção para o que importa aqui: os internos só para service_role
await su.query(`revoke all on function public.handoff_allows_assistant(uuid,uuid), public.handoff_mark_pending(uuid,uuid,text) from public, anon, authenticated`);

let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations aplicadas sem erro", failed.length === 0, failed.join(" | "));

// Modelo simulado
const llm = { reply: "Claro! Posso ajudar com isso.", delayMs: 0, calls: 0, onCall: null };
const llmServer = createServer(async (req, res) => {
  for await (const _ of req); llm.calls++;
  if (llm.onCall) await llm.onCall();
  if (llm.delayMs) await new Promise((r) => setTimeout(r, llm.delayMs));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ model: "fake/model", choices: [{ message: { content: llm.reply }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
});
await new Promise((r) => llmServer.listen(0, "127.0.0.1", r));
const shim = await startShim({ conn: { host: "127.0.0.1", port: 5544, user: "postgres", database: DB }, serviceKey: "svc-key-e2e" });
const DENO = process.env.DENO_BIN ?? "deno";
const proc = spawn(DENO, ["run", "-A", "--node-modules-dir=none", new URL("./denoEntryAssistant.ts", import.meta.url).pathname], {
  env: { ...process.env, DENO_CERT: process.env.DENO_CERT ?? "/root/.ccr/ca-bundle.crt", SUPABASE_URL: `http://127.0.0.1:${shim.port}`, SUPABASE_ANON_KEY: "svc-key-e2e", SUPABASE_SERVICE_ROLE_KEY: "svc-key-e2e",
    OPENROUTER_API_KEY: "k", FAKE_LLM_URL: `http://127.0.0.1:${llmServer.address().port}`, PORT: String(PORT), INDEX_URL: new URL("../../functions/assistant-chat/index.ts", import.meta.url).href },
  stdio: ["ignore", "pipe", "pipe"] });
let out = ""; proc.stdout.on("data", (d) => (out += d)); proc.stderr.on("data", (d) => (out += d));
await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error("Deno não ficou pronto:\n" + out)), 120000); const iv = setInterval(() => { if (out.includes("READY")) { clearInterval(iv); clearTimeout(t); resolve(); } if (proc.exitCode !== null) { clearInterval(iv); clearTimeout(t); reject(new Error("Deno saiu:\n" + out)); } }, 200); });

const U = { H: "a0000000-0000-0000-0000-00000000000a", C: "c0000000-0000-0000-0000-00000000000c", S: "50000000-0000-0000-0000-000000000005" };
const HID = "aa000000-0000-0000-0000-0000000000aa";
for (const [k, id] of Object.entries(U)) { await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, k + "@x"]); await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name`, [id, k === "H" ? "casa" : "cliente", k === "C" ? "Carla Teste" : "Pessoa " + k + " Teste"]); }
await su.query("set session_replication_role = replica");
await su.query(`insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa H','casa-h','maximo')`, [HID, U.H]);
await su.query("set session_replication_role = origin");
await su.query(`insert into assistants(house_id,enabled,display_name) values ($1,true,'Luna')`, [HID]);
await su.query(`insert into house_staff(house_id,user_id,name,perms) values ($1,$2,'Equipe Um',array['chat_reply','chat_read'])`, [HID, U.S]);
const as = async (uid, fn) => { const c = await connect(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query(`set role authenticated`); return await fn(c); } finally { await c.end(); } };
const call = (msg, conv) => fetch(`http://127.0.0.1:${PORT}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer user-${U.C}` }, body: JSON.stringify({ house_id: U.H, message: msg, conversation_id: conv }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const n = async (sql, p = []) => Number((await su.query(sql, p)).rows[0].n);
const CONV = await as(U.C, async (c) => (await c.query(`select open_conversation($1) id`, [U.H])).rows[0].id);
const assistMsgs = () => n(`select count(*) n from messages where conversation_id=$1 and from_assistant`, [CONV]);
const usage = () => n(`select count(*) n from assistant_usage`);
const handoffNotifs = () => n(`select count(*) n from notifications where user_id=$1 and kind='handoff'`, [U.H]);

// 1) Ninguém humano atendendo: a assistente responde
let r = await call("Oi, quais serviços vocês têm?", CONV);
ok("sem humano: a assistente responde (200 com texto)", r.status === 200 && typeof r.body.reply === "string" && r.body.reply.includes("Posso ajudar"), JSON.stringify(r.body).slice(0, 160));
ok("sem humano: 1 resposta gravada e 1 consumo", (await assistMsgs()) === 1 && (await usage()) === 1);

// 2) A casa responde: a assistente não fala por cima
await as(U.H, (c) => c.query(`insert into messages(conversation_id,sender_id,text) values ($1,$2,'Oi, aqui é a casa')`, [CONV, U.H]));
const callsBefore = llm.calls, usageBefore = await usage(), assistBefore = await assistMsgs();
r = await call("E o valor?", CONV);
ok("casa respondeu: 200 sem resposta da assistente, marcado como atendimento humano", r.status === 200 && r.body.reply === null && r.body.handled_by_human === true, JSON.stringify(r.body));
ok("casa respondeu: o modelo NÃO foi chamado e nada foi cobrado", llm.calls === callsBefore && (await usage()) === usageBefore && (await assistMsgs()) === assistBefore);
ok("casa respondeu: a mensagem do cliente ficou gravada", (await n(`select count(*) n from messages where conversation_id=$1 and sender_id=$2 and text='E o valor?'`, [CONV, U.C])) === 1);
ok("casa respondeu: a casa foi avisada (1 aviso não lido)", (await n(`select count(*) n from notifications where user_id=$1 and read=false and text like '%enviou uma mensagem%'`, [U.H])) === 1);
r = await call("Alguém?", CONV);
ok("casa respondeu: 2º recado não duplica aviso (continua 1 não lido)", (await n(`select count(*) n from notifications where user_id=$1 and read=false and text like '%enviou uma mensagem%'`, [U.H])) === 1 && r.body.handled_by_human === true);

// 3) Casa devolve à assistente: ela volta
await as(U.H, (c) => c.query(`select handoff_release($1)`, [CONV]));
r = await call("Posso agendar?", CONV);
ok("devolvida: a assistente volta a responder", r.status === 200 && typeof r.body.reply === "string" && !r.body.handled_by_human, JSON.stringify(r.body).slice(0, 120));

// 4) Assunto sensível: passa para a casa; estado, aviso por coluna, sem aviso repetido
llm.reply = "Sinto muito por isso. [[CASA: luto na família]]";
r = await call("Perdi minha mãe e preciso conversar", CONV);
ok("passagem: o cliente recebe resposta acolhedora sem o marcador", r.status === 200 && !String(r.body.reply).includes("[[") && r.body.reply.includes("Sinto muito"), r.body.reply);
let st = (await su.query(`select state, reason from conversation_handoff where conversation_id=$1`, [CONV])).rows[0];
ok("passagem: estado 'pendente' com o motivo", st?.state === "pendente" && st.reason === "luto na família", JSON.stringify(st));
ok("passagem: 1 aviso 'precisa de você' identificado por kind='handoff'", (await handoffNotifs()) === 1);
r = await call("Ainda estou aqui", CONV);
ok("pendente: a assistente NÃO responde (casa ainda não assumiu)", r.body.handled_by_human === true && r.body.reply === null, JSON.stringify(r.body));
llm.reply = "Posso ajudar com isso.";
// 5) Equipe assume respondendo
await as(U.S, (c) => c.query(`select staff_send($1,'Oi, sou da equipe da casa')`, [CONV]));
st = (await su.query(`select state, handler_name from conversation_handoff where conversation_id=$1`, [CONV])).rows[0];
ok("equipe respondeu: 'humano' com o nome", st.state === "humano" && st.handler_name === "Equipe Um", JSON.stringify(st));
const c0 = llm.calls; r = await call("Obrigada", CONV);
ok("equipe atendendo: a assistente não responde por cima", r.body.handled_by_human === true && llm.calls === c0);

// 6) Corrida: o humano responde enquanto a IA ainda "pensa"
await as(U.H, (c) => c.query(`select handoff_release($1)`, [CONV]));
const assistB = await assistMsgs(), usageB = await usage();
llm.onCall = async () => { await as(U.H, (c) => c.query(`insert into messages(conversation_id,sender_id,text) values ($1,$2,'Cheguei, deixa comigo')`, [CONV, U.H])); llm.onCall = null; };
r = await call("Quero marcar um horário", CONV);
ok("corrida: resposta da IA descartada, cliente informado do atendimento humano", r.status === 200 && r.body.handled_by_human === true && r.body.reply === null, JSON.stringify(r.body));
ok("corrida: nenhuma resposta da assistente gravada e nada cobrado", (await assistMsgs()) === assistB && (await usage()) === usageB);
llm.onCall = null;

// 7) Dedupe de aviso: duas passagens seguidas (após devolver) não avisam duas vezes em 30 min
await as(U.H, (c) => c.query(`select handoff_release($1)`, [CONV]));
const hb = await handoffNotifs();
llm.reply = "Entendo. [[CASA: dúvida difícil]]";
await call("Preciso de ajuda séria", CONV);
await as(U.H, (c) => c.query(`select handoff_release($1)`, [CONV]));
await call("Outra coisa séria", CONV);
ok("dedupe: duas passagens em 30 min geram só 1 aviso novo", (await handoffNotifs()) === hb, `${await handoffNotifs()} vs ${hb}`);
ok("dedupe: as duas passagens ficaram registradas em handoff_events", (await n(`select count(*) n from handoff_events where conversation_id=$1 and action='passada_para_casa'`, [CONV])) >= 3);

// 8) Segurança: conversa de outro usuário e chamada sem login
r = await fetch(`http://127.0.0.1:${PORT}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer user-${U.S}` }, body: JSON.stringify({ house_id: U.H, message: "oi", conversation_id: CONV }) }).then((x) => x.status);
ok("segurança: quem não é membro da conversa recebe 403", r === 403, r);
r = await fetch(`http://127.0.0.1:${PORT}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ house_id: U.H, message: "oi" }) }).then((x) => x.status);
ok("segurança: sem login recebe 401", r === 401, r);

// 9) Migration ausente: o fluxo antigo continua funcionando (implantação em qualquer ordem)
await su.query(`drop function public.handoff_allows_assistant(uuid,uuid); drop function public.handoff_mark_pending(uuid,uuid,text)`);
await su.query(`alter table notifications drop constraint notifications_kind_check; alter table notifications drop column kind`);
llm.reply = "Tudo certo por aqui."; r = await call("Teste sem migration", CONV);
ok("sem as funções da 0071: a assistente ainda responde (comportamento anterior)", r.status === 200 && typeof r.body.reply === "string", JSON.stringify(r.body));
llm.reply = "Entendo. [[CASA: caso novo]]";
await su.query(`delete from notifications where user_id=$1`, [U.H]);
r = await call("Assunto sensível sem migration", CONV);
ok("sem as funções da 0071: a passagem ainda avisa a casa (sem a coluna kind)", r.status === 200 && (await n(`select count(*) n from notifications where user_id=$1 and text like '%precisa de você:%'`, [U.H])) === 1, JSON.stringify(r.body).slice(0, 120));

console.log(bad ? `\n${bad} FALHA(S)` : "\nTODAS AS VERIFICAÇÕES PASSARAM");
if (shim.log.errors.length) console.log("erros do shim:", shim.log.errors.slice(0, 6).join(" | "));
proc.kill("SIGTERM"); llmServer.close(); await shim.close(); await su.end(); process.exit(bad ? 1 : 0);

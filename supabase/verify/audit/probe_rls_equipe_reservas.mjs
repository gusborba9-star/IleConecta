// Sondagens LOCAIS (PostgreSQL 16 local, migrations do repo) — nenhuma consulta a produção.
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { STUBS } from "../pgbase.mjs";
const MAX = Number(process.argv[2] ?? 63), DB = "probe" + MAX, MIG = new URL("../../migrations/", import.meta.url).pathname;
const conn = (database) => { const c = new pg.Client({ host: "127.0.0.1", port: 5544, user: "postgres", database }); return c.connect().then(() => c); };
const a = await conn("postgres"); await a.query(`drop database if exists ${DB} with (force)`); await a.query(`create database ${DB}`); await a.end();
const su = await conn(DB); await su.query(STUBS);
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= MAX).sort()) await su.query(readFileSync(MIG + f, "utf8").replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, ""));
// Privilégios como em produção (medidos em 2026-11-09): anon/authenticated com todos os privilégios de tabela; execute conforme has_function_privilege medido.
const ANON = "accept_staff_invite calendar_enabled calendar_premium_limits campaign_plan_limit cancel_reservation conversation_has_premium_house event_attendees event_stream_url event_taken house_calendar house_seat_allowance is_house_owner leave_waitlist_on_reserve messages_media_needs_premium my_campaign_days my_campaigns_summary my_conversations my_house_topics my_staff_house my_top_services notify_waitlist_on_free_seat open_conversation payment_max_cents payments_enabled peer_info quick_reply_plan_limit referral_lookup reject_blocked_message staff_calendar_add staff_calendar_delete staff_calendar_list staff_can_see_conversation staff_conversations staff_messages staff_orders staff_perm staff_plan_limit staff_post staff_row staff_send touch_presence track_campaign can_view_profile post_like_counts enforce_min_description events_guard_seats fee_cents set_updated_at split_gross_cents stage_amount_cents".split(" ");
const NOAUTH = "house_calendar_blocks service_offered_to_me business_release_at check_cron_secret complete_cancel_refund confirm_member_due_payment confirm_payment files_purged files_to_purge handle_new_user has_client_terms has_recent_consent member_drop_open_dues member_due_payment member_dues_daily member_ensure_due notify_new_message notify_push open_auto_refund open_refund_for_payment protect_house_privileged_columns push_config record_processor_fee referral_on_first_login referral_on_signup refund_log_add release_due_payouts review_ask_event review_ask_service staff_audit_role staff_audit_log handoff_allows_assistant handoff_effective_active handoff_mark_pending handoff_actor trg_messages_handoff trg_staff_invites_audit trg_house_staff_audit".split(" ");
await su.query(`grant usage on schema public, auth, storage to anon, authenticated, service_role; grant all on all tables in schema public to anon, authenticated, service_role; grant execute on all functions in schema auth to anon, authenticated, service_role, public;`);
const fns = (await su.query(`select p.oid::regprocedure::text sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_depend d on d.objid=p.oid and d.deptype='e' where n.nspname='public' and d.objid is null`)).rows;
for (const f of fns) { await su.query(`revoke all on function ${f.sig} from public, anon, authenticated`); if (ANON.includes(f.proname)) await su.query(`grant execute on function ${f.sig} to anon`); if (!NOAUTH.includes(f.proname)) await su.query(`grant execute on function ${f.sig} to authenticated`); await su.query(`grant execute on function ${f.sig} to service_role`); }
const U = { A: "a0000000-0000-0000-0000-00000000000a", B: "b0000000-0000-0000-0000-00000000000b", C: "c0000000-0000-0000-0000-00000000000c", D: "d0000000-0000-0000-0000-00000000000d", S: "50000000-0000-0000-0000-000000000005", T: "70000000-0000-0000-0000-000000000007" };
const HA = "aa000000-0000-0000-0000-0000000000aa", HB = "bb000000-0000-0000-0000-0000000000bb";
await su.query("select set_config('test.role','service_role',false)");
for (const [k, id] of Object.entries(U)) { await su.query(`insert into auth.users(id,email) values ($1,$2) on conflict do nothing`, [id, k + "@x"]); await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name, city=excluded.city`, [id, k === "A" || k === "B" ? "casa" : "cliente", "Pessoa " + k]); }
await su.query("set session_replication_role = replica");
await su.query(`insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','maximo'),($3,$4,'Casa B','casa-b','maximo')`, [HA, U.A, HB, U.B]);
await su.query("set session_replication_role = origin");
await su.query(`insert into platform_settings(key,value) values ('features','{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb) on conflict (key) do update set value=excluded.value`);
const DC = MAX >= 67 ? ",duration_min" : "", DV = MAX >= 67 ? ",120" : "";
const out = []; const ok = (name, pass, detail = "") => { out.push([pass ? "PASS" : "FAIL", name, detail]); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + String(detail).slice(0, 220) : ""}`); };
const info = (name, detail) => console.log(`INFO ${name} — ${String(detail).slice(0, 300)}`);
async function as(role, uid, fn) { const c = await conn(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } }
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
// ---------- semeadura de dados da Casa A ----------
const EV = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status${DC}) values ($1,'Ritual A','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,1,now()+interval '5 days','publicado'${DV}) returning id`, [HA])).rows[0].id;
await su.query(`insert into event_secrets(event_id, stream_url) values ($1,'https://stream.exemplo/secreto')`, [EV]).catch((e) => info("event_secrets seed", e.message));
const RES_C = (await as("authenticated", U.C, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [EV])));
const CONV = (await as("authenticated", U.C, (c) => q(c, `select open_conversation($1) id`, [U.A]))).rows[0].id;
await as("authenticated", U.C, (c) => q(c, `insert into messages(conversation_id,sender_id,text) values ($1,$2,'mensagem privada do cliente C para a casa A')`, [CONV, U.C]));
await su.query(`insert into house_members(house_id,display_name,monthly_cents,due_day) values ($1,'Membro Sigiloso',5000,10)`, [HA]).catch((e) => info("house_members seed", e.message));
await su.query(`insert into posts(house_id,content,kind) values ($1,'post da casa A','geral')`, [HA]).catch(async () => { const cols = (await su.query(`select string_agg(column_name,',') c from information_schema.columns where table_name='posts'`)).rows[0].c; info("posts cols", cols); });
const POST = (await su.query(`select id from posts limit 1`)).rows[0]?.id;
if (POST) await as("authenticated", U.C, (c) => q(c, `insert into post_likes(post_id,user_id) values ($1,$2)`, [POST, U.C]));
console.log("\n===== [4] RLS / exposição pública (papel anon, sem login) =====");
await as("anon", null, async (c) => {
  const r = await q(c, `select id, display_name, city, state, last_seen_at, account_type from profiles`);
  ok("anon NÃO lê perfis de clientes (nome, cidade, último acesso)", !(r.rows?.some((x) => x.account_type === "cliente")), r.err ?? `anon leu ${r.rows.length} perfis, ${r.rows.filter((x) => x.account_type === "cliente").length} de clientes`);
  const l = await q(c, `select post_id, user_id from post_likes`); ok("anon NÃO vê quem curtiu publicações de casas religiosas", !(l.rows?.length), l.err ?? `anon leu ${l.rows.length} curtida(s) com user_id`);
  const s = await q(c, `select key from platform_settings`); info("anon lê platform_settings", s.err ?? s.rows.map((x) => x.key).join(","));
  const h = await q(c, `select owner_id, plan, referral_code from houses`); info("anon lê houses (owner_id, plan, referral_code)", h.err ?? JSON.stringify(h.rows[0]));
  for (const t of ["reservations", "service_orders", "messages", "conversations", "payments", "ledger_entries", "legal_consents", "house_members", "house_staff", "house_staff_invites", "notifications", "follows", "event_secrets", "assistants", "house_payment_accounts", "refund_requests", "member_dues", "admins", "stripe_events"]) { const r = await q(c, `select count(*)::int n from ${t}`); ok(`anon não lê ${t}`, r.err ? true : r.rows[0].n === 0, r.err ? "negado" : `${r.rows[0].n} linha(s)`); }
  for (const [name, sql, p] of [["peer_info", `select * from peer_info($1)`, [U.C]], ["event_attendees", `select * from event_attendees($1)`, [EV]], ["event_stream_url", `select event_stream_url($1) v`, [EV]], ["my_conversations", `select * from my_conversations()`, []], ["staff_conversations", `select * from staff_conversations()`, []], ["staff_messages", `select * from staff_messages($1)`, [CONV]], ["staff_orders", `select * from staff_orders()`, []], ["my_top_services", `select * from my_top_services(30)`, []], ["my_house_topics", `select * from my_house_topics(30)`, []], ["cancel_reservation", `select cancel_reservation($1)`, [RES_C.rows?.[0]?.id]], ["open_conversation", `select open_conversation($1)`, [U.A]], ["staff_send", `select staff_send($1,'oi')`, [CONV]], ["staff_post", `select staff_post('spam')`, []], ["touch_presence", `select touch_presence()`, []]]) {
    const r = await q(c, sql, p); const leaked = !r.err && r.rows.some((x) => Object.values(x).some((v) => v !== null && v !== "" && v !== false));
    ok(`anon chamando ${name}() não obtém dado nem efeito`, !leaked, r.err ? "erro: " + r.err.slice(0, 80) : `${r.rows.length} linha(s)`);
  }
  for (const [t, sql, p] of [["profiles update", `update profiles set display_name='hack' where id=$1`, [U.C]], ["posts insert", `insert into posts(house_id,content,kind) values ($1,'x','geral')`, [HA]], ["houses update", `update houses set plan='maximo'`, []], ["messages insert", `insert into messages(conversation_id,sender_id,text) values ($1,$2,'x')`, [CONV, U.C]]]) { const r = await q(c, sql, p); ok(`anon não escreve: ${t}`, Boolean(r.err) || r.n === 0, r.err ? "negado" : `${r.n} linha(s)`); }
});
console.log("\n===== [4] Isolamento entre casas (dono da Casa B e cliente D tentando dados da Casa A) =====");
for (const [who, uid] of [["dono da Casa B", U.B], ["cliente D", U.D]]) await as("authenticated", uid, async (c) => {
  for (const t of ["reservations", "messages", "conversations", "conversation_members", "payments", "ledger_entries", "house_members", "house_staff_invites", "event_secrets", "assistants", "house_availability", "legal_consents", "notifications", "follows"]) { const r = await q(c, `select count(*)::int n from ${t}`); ok(`${who} não lê ${t} da Casa A`, r.err ? true : r.rows[0].n === 0, r.err ? "negado" : `${r.rows[0].n} linha(s)`); }
  for (const [t, sql, p] of [["update houses A", `update houses set name='x' where id=$1`, [HA]], ["insert post na Casa A", `insert into posts(house_id,content,kind) values ($1,'x','geral')`, [HA]], ["update events A", `update events set price_cents=1 where id=$1`, [EV]], ["update perfil alheio", `update profiles set display_name='x' where id=$1`, [U.C]], ["insert reserva direta", `insert into reservations(event_id,user_id,status,expires_at) values ($1,$2,'confirmada',now())`, [EV, uid]], ["update payments", `update payments set status='confirmado'`, []], ["insert ledger", `insert into ledger_entries(house_id,entry_type,amount_cents,fee_rule_version) values ($1,'casa',100,'x')`, [HA]], ["insert notificação a terceiro", `insert into notifications(user_id,text) values ($1,'phishing')`, [U.C]], ["insert staff em casa alheia", `insert into house_staff(house_id,user_id,name) values ($1,$2,'Intruso')`, [HA, uid]], ["event_attendees A", `select * from event_attendees($1)`, [EV]], ["event_stream_url A", `select event_stream_url($1) v`, [EV]], ["staff_messages conv A", `select * from staff_messages($1)`, [CONV]]]) {
    const r = await q(c, sql, p); const bad = !r.err && ((r.rows?.some((x) => Object.values(x).some((v) => v !== null))) || (r.rows?.length === 0 && r.n > 0));
    ok(`${who}: ${t} negado`, !bad, r.err ? "negado: " + r.err.slice(0, 60) : `${r.n} linha(s)`);
  }
});
await as("authenticated", U.B, async (c) => { const r = await q(c, `update houses set plan='maximo', verified=true where id=$1 returning plan, verified`, [HB]); const r2 = await q(c, `update houses set plan='base' where id=$1`, [HB]); const v = (await su.query(`select plan, verified from houses where id=$1`, [HB])).rows[0]; ok("dono não altera o próprio plano/verificação pela API", v.plan === "maximo" && v.verified === false, JSON.stringify(v) + " " + (r.err ?? "") + (r2.err ?? "")); });
await as("authenticated", U.D, async (c) => { const r = await q(c, `update profiles set account_type='casa' where id=$1 returning account_type`, [U.D]); info("cliente muda o próprio account_type para 'casa' via API", r.err ?? JSON.stringify(r.rows)); await su.query(`update profiles set account_type='cliente' where id=$1`, [U.D]); });
if (MAX >= 67) {
  console.log("\n===== [4b] F2: quem PODE ver o quê =====");
  await su.query(`insert into service_orders(service_id,house_id,client_id,title,price_cents,status) select s.id, s.house_id, $2, s.title, 0, 'cancelado' from services s limit 1`, [U.C, U.C]).catch(() => null);
  await as("authenticated", U.C, async (c) => { ok("cliente vê o próprio perfil", ((await q(c, `select id from profiles where id=$1`, [U.C])).rows ?? []).length === 1); ok("cliente vê o perfil da casa com quem conversa", ((await q(c, `select id from profiles where id=$1`, [U.A])).rows ?? []).length === 1); });
  await as("authenticated", U.A, (c) => q(c, `select 1`)).catch(() => null);
  await as("authenticated", U.A, async (c) => { ok("casa vê o perfil do cliente que conversou/reservou com ela", ((await q(c, `select id from profiles where id=$1`, [U.C])).rows ?? []).length === 1); ok("casa NÃO vê perfil de cliente sem relação", ((await q(c, `select id from profiles where id=$1`, [U.D])).rows ?? []).length === 0); });
  await as("authenticated", U.D, async (c) => { ok("outro cliente NÃO vê o perfil de C", ((await q(c, `select id from profiles where id=$1`, [U.C])).rows ?? []).length === 0); ok("peer_info de quem não tem relação não devolve dados", ((await q(c, `select * from peer_info($1)`, [U.C])).rows ?? []).length === 0); ok("qualquer logado ainda vê perfis de casas", ((await q(c, `select id from profiles where id=$1`, [U.B])).rows ?? []).length === 1); });
  await as("anon", null, async (c) => { ok("visitante ainda vê perfis de casas", ((await q(c, `select id from profiles where account_type='casa'`)).rows ?? []).length === 2); const k = await q(c, `select * from post_like_counts($1)`, [[POST]]); ok("visitante vê a CONTAGEM de curtidas, sem identidades", k.rows?.[0]?.n === 1, JSON.stringify(k.rows ?? k.err)); });
  await as("authenticated", U.A, async (c) => { ok("dona da publicação vê quem curtiu", ((await q(c, `select user_id from post_likes where post_id=$1`, [POST])).rows ?? []).length === 1); });
  await as("authenticated", U.D, async (c) => { ok("outro logado NÃO vê quem curtiu", ((await q(c, `select user_id from post_likes where post_id=$1`, [POST])).rows ?? []).length === 0); });
}
if (MAX >= 67) {
  console.log("\n===== [4c] F2: cada relação libera o perfil à casa (e só enquanto existir) =====");
  const X = "f0000000-0000-0000-0000-00000000000f";
  await su.query(`insert into auth.users(id,email) values ($1,'X@x') on conflict do nothing`, [X]); await su.query(`insert into profiles(id,account_type,display_name) values ($1,'cliente','Pessoa X') on conflict do nothing`, [X]);
  const seesX = async (who) => ((await as("authenticated", who, (c) => q(c, `select id from profiles where id=$1`, [X]))).rows ?? []).length === 1;
  ok("sem relação, a casa A não vê X", !(await seesX(U.A)));
  const SVX = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'buzios','Serviço de teste 4c','Descrição longa o suficiente para passar na validação mínima de descrição do serviço.',1000,false,'presencial',false,60) returning id`, [HA])).rows[0].id;
  await su.query("set session_replication_role = replica");
  const rels = {
    "pedido de serviço": [`insert into service_orders(id,service_id,house_id,client_id,title,price_cents,status) values ('f1000000-0000-0000-0000-000000000001',$1,$2,$3,'t',0,'cancelado')`, [SVX, HA, X], `delete from service_orders where id='f1000000-0000-0000-0000-000000000001'`],
    "reserva de ritual": [`insert into reservations(id,event_id,user_id,status,expires_at) values ('f1000000-0000-0000-0000-000000000002',$1,$2,'cancelada',now())`, [EV, X], `delete from reservations where id='f1000000-0000-0000-0000-000000000002'`],
    "fila de espera": [`insert into event_waitlist(event_id,user_id) values ($1,$2)`, [EV, X], `delete from event_waitlist where user_id='${X}'`],
    "seguidor": [`insert into follows(follower_id,house_id) values ($1,$2)`, [X, HA], `delete from follows where follower_id='${X}'`],
    "membro da casa": [`insert into house_members(id,house_id,display_name,user_id) values ('f1000000-0000-0000-0000-000000000003',$1,'Membro X',$2)`, [HA, X], `delete from house_members where id='f1000000-0000-0000-0000-000000000003'`],
    "comentário em publicação da casa": [`insert into post_comments(post_id,user_id,text) values ($1,$2,'oi')`, [POST, X], `delete from post_comments where user_id='${X}'`],
    "pedido de reembolso": [`insert into refund_requests(id,payment_id,house_id,client_id,kind,amount_cents) values ('f1000000-0000-0000-0000-000000000004',gen_random_uuid(),$1,$2,'antes_do_inicio',100)`, [HA, X], `delete from refund_requests where id='f1000000-0000-0000-0000-000000000004'`],
  };
  for (const [name, [ins, p, del]] of Object.entries(rels)) {
    const r = await su.query(ins, p).then(() => null, (e) => e.message);
    if (r) { ok(`relação '${name}' semeada`, false, r); continue; }
    ok(`com ${name}: a casa A vê X`, await seesX(U.A)); ok(`com ${name}: a casa B (sem relação) NÃO vê X`, !(await seesX(U.B)));
    await su.query(del); ok(`sem ${name}: a casa A volta a NÃO ver X`, !(await seesX(U.A)));
  }
  await su.query("set session_replication_role = origin");
  const adm = "ad000000-0000-0000-0000-0000000000ad"; await su.query(`insert into auth.users(id,email) values ($1,'adm@x') on conflict do nothing`, [adm]); await su.query(`insert into profiles(id,account_type,display_name) values ($1,'cliente','Admin') on conflict do nothing`, [adm]); await su.query(`insert into admins(user_id) values ($1) on conflict do nothing`, [adm]);
  ok("administrador central vê qualquer perfil", await seesX(adm));
}
console.log("\n===== [5] Equipe: convite, aceite, permissões, revogação =====");
const inv = await as("authenticated", U.A, (c) => q(c, `insert into house_staff_invites(house_id,name,perms) values ($1,'Atendente S',array['chat_reply']) returning token`, [HA]));
ok("titular cria convite", !inv.err, inv.err);
const TOKEN = inv.rows?.[0]?.token;
const inv2 = await as("authenticated", U.A, (c) => q(c, `insert into house_staff_invites(house_id,name,perms) values ($1,'Segundo',array['chat_reply']) returning token`, [HA]));
ok("limite de acessos do plano bloqueia 2º convite (Premium = 1 acesso)", Boolean(inv2.err), inv2.err ?? "criou 2º convite");
ok("dono de outra casa não cria convite na Casa A", Boolean((await as("authenticated", U.B, (c) => q(c, `insert into house_staff_invites(house_id,name) values ($1,'Intruso')`, [HA]))).err));
ok("convite não é legível por terceiros", ((await as("authenticated", U.D, (c) => q(c, `select token from house_staff_invites`))).rows ?? []).length === 0);
ok("titular não aceita o próprio convite", Boolean((await as("authenticated", U.A, (c) => q(c, `select accept_staff_invite($1)`, [TOKEN]))).err));
ok("dono de outra casa não vira equipe", Boolean((await as("authenticated", U.B, (c) => q(c, `select accept_staff_invite($1)`, [TOKEN]))).err));
// corrida: S e T aceitam o MESMO convite ao mesmo tempo
const [r1, r2] = await Promise.all([as("authenticated", U.S, (c) => q(c, `select accept_staff_invite($1)`, [TOKEN])), as("authenticated", U.T, (c) => q(c, `select accept_staff_invite($1)`, [TOKEN]))]);
const staffN = (await su.query(`select count(*)::int n from house_staff where house_id=$1`, [HA])).rows[0].n;
ok("um convite gera no máximo 1 vínculo mesmo com 2 aceites simultâneos", staffN === 1, `vínculos criados: ${staffN} (${r1.err ? "S erro" : "S ok"}, ${r2.err ? "T erro" : "T ok"})`);
const active = (await su.query(`select user_id from house_staff where house_id=$1 order by created_at, id limit 1`, [HA])).rows[0].user_id; const SU = active;
ok("convite usado não pode ser reutilizado", Boolean((await as("authenticated", U.D, (c) => q(c, `select accept_staff_invite($1)`, [TOKEN]))).err));
await as("authenticated", SU, async (c) => {
  ok("atendente vê a conversa da casa (chat_reply)", ((await q(c, `select * from staff_messages($1)`, [CONV])).rows ?? []).length > 0);
  ok("atendente sem 'orders' não vê pedidos", Boolean((await q(c, `select * from staff_orders()`)).err));
  ok("atendente sem 'post' não publica", Boolean((await q(c, `select staff_post('x')`)).err));
  const up = await q(c, `update house_staff set perms = array['chat_reply','orders','post','members','calendar','stats'] where user_id=$1`, [SU]); ok("atendente não amplia as próprias permissões", Boolean(up.err) || up.n === 0, up.err ?? `${up.n} linha(s)`);
  for (const t of ["payments", "ledger_entries", "house_members", "reservations", "house_payment_accounts"]) { const r = await q(c, `select count(*)::int n from ${t}`); ok(`atendente (só chat) não lê ${t}`, r.err ? true : r.rows[0].n === 0, r.err ? "negado" : `${r.rows[0].n}`); }
  const s = await q(c, `select staff_send($1,'resposta da atendente')`, [CONV]); ok("atendente responde na mesma conversa", !s.err, s.err);
});
const sm = (await su.query(`select staff_name, sender_id from messages where conversation_id=$1 and text='resposta da atendente'`, [CONV])).rows[0];
ok("resposta da equipe fica identificada (staff_name) na conversa original", sm?.staff_name === "Atendente S" && sm?.sender_id === U.A, JSON.stringify(sm));
await as("authenticated", U.A, (c) => q(c, `update house_staff set active=false where user_id=$1`, [SU]));
ok("pausado pelo titular perde o acesso imediatamente", Boolean((await as("authenticated", SU, (c) => q(c, `select * from staff_messages($1)`, [CONV]))).err));
await as("authenticated", U.A, (c) => q(c, `delete from house_staff where user_id=$1`, [SU]));
ok("removido pelo titular perde o vínculo", ((await as("authenticated", SU, (c) => q(c, `select * from my_staff_house()`))).rows ?? []).length === 0);
const aud = (await su.query(`select count(*)::int n from admin_audit`)).rows[0].n; info("auditoria de alterações de equipe (admin_audit) após convite/aceite/pausa/remoção", `${aud} registro(s)`);
console.log("\n===== [9] Agenda, reserva e checkout =====");
// última vaga: C já tem a vaga (pagamentos desligados => confirmada). D e T disputam 1 vaga em outro ritual.
const EV2 = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status${DC}) values ($1,'Ritual 1 vaga','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,1,now()+interval '5 days','publicado'${DV}) returning id`, [HA])).rows[0].id;
const race = await Promise.all([U.D, U.T, U.S, U.C].map((u) => as("authenticated", u, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [EV2]))));
const taken = (await su.query(`select count(*)::int n from reservations where event_id=$1 and status in ('confirmada','aguardando_pagamento')`, [EV2])).rows[0].n;
ok("última vaga: 4 reservas simultâneas => exatamente 1 vaga ocupada", taken === 1 && race.filter((r) => !r.err).length === 1, `ocupadas=${taken}, sucessos=${race.filter((r) => !r.err).length}`);
const EV3 = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status${DC}) values ($1,'Ritual em 20 min','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,now()+interval '20 minutes','publicado'${DV}) returning id`, [HA])).rows[0].id;
const late = await as("authenticated", U.D, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [EV3]));
ok("Blueprint 10.2: novas participações encerram 1h antes do início", Boolean(late.err), late.err ?? "reserva aceita a 20 min do início");
// reserva paga: retenção de 15 min e liberação
await su.query(`update platform_settings set value='{"payments":{"state":"on"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
await su.query(`insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_A','ativa',true,true)`, [HA, U.A]).catch((e) => info("hpa seed", e.message));
for (const u of [U.A]) await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_casa','x')`, [u]).catch((e) => info("consent casa", e.message));
for (const u of [U.D, U.T]) for (const d of ["termos_cliente", "dados_sensiveis"]) await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,$2,'x')`, [u, d]).catch((e) => info("consent", e.message));
const EV4 = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status${DC}) values ($1,'Ritual pago','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,1,now()+interval '5 days','publicado'${DV}) returning id`, [HA])).rows[0].id;
const hold = await as("authenticated", U.D, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [EV4]));
const hr = hold.err ? null : (await su.query(`select status, round(extract(epoch from (expires_at-now()))/60) m from reservations where id=$1`, [hold.rows[0].id])).rows[0];
ok("reserva paga nasce temporária com 15 minutos", hr?.status === "aguardando_pagamento" && Number(hr?.m) === 15, hold.err ?? JSON.stringify(hr));
ok("vaga retida bloqueia outro cliente", Boolean((await as("authenticated", U.T, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [EV4]))).err));
if (!hold.err) await su.query(`update reservations set expires_at = now() - interval '1 second' where id=$1`, [hold.rows[0].id]);
const after = await as("authenticated", U.T, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [EV4]));
ok("retenção vencida libera a vaga para outro cliente", !after.err, after.err);
const st = hold.err ? null : (await su.query(`select r.status, (select status from payments where reservation_id=r.id) pay from reservations r where id=$1`, [hold.rows[0].id])).rows[0];
ok("reserva vencida vira 'expirada' e o pagamento pendente vira 'falhou'", st?.status === "expirada" && st?.pay === "falhou", JSON.stringify(st));
// serviço com agenda: mesmo horário, 2 clientes ao mesmo tempo
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
for (let d = 0; d < 7; d++) await su.query(`insert into house_availability(house_id,weekday,start_time,end_time) values ($1,$2,'08:00','20:00')`, [HA, d]);
const SV = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'buzios','Jogo de búzios','Descrição longa o suficiente para passar na validação mínima de descrição do serviço.',10000,true,'presencial',true,60) returning id`, [HA])).rows[0].id;
const SV2 = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'cartas','Leitura de cartas','Descrição longa o suficiente para passar na validação mínima de descrição do serviço.',8000,true,'presencial',true,60) returning id`, [HA])).rows[0].id;
const slot = (await as("authenticated", U.D, (c) => q(c, `select slot from available_slots($1, null, 7) limit 1`, [SV]))).rows?.[0]?.slot;
const bk = await Promise.all([[U.D, SV], [U.T, SV], [U.C, SV2], [U.S, SV2]].map(([u, s]) => as("authenticated", u, (c) => q(c, `select create_booking($1,$2,null) id`, [s, slot]))));
const booked = (await su.query(`select count(*)::int n from service_orders where house_id=$1 and scheduled_at=$2 and status in ('aguardando_pagamento','confirmado','em_andamento')`, [HA, slot])).rows[0].n;
ok("mesmo horário, 4 agendamentos simultâneos (2 serviços da mesma casa) => 1 confirmado", booked === 1 && bk.filter((r) => !r.err).length === 1, `ativos=${booked}, sucessos=${bk.filter((r) => !r.err).length}; erros: ${[...new Set(bk.filter((r) => r.err).map((r) => r.err.slice(0, 50)))].join(" | ")}`);
const still = (await as("authenticated", U.S, (c) => q(c, `select count(*)::int n from available_slots($1, null, 7) where slot=$2`, [SV2, slot]))).rows?.[0]?.n;
ok("horário ocupado some da disponibilidade de todos os serviços da casa (fonte única)", still === 0, `ainda aparece: ${still}`);
// ritual x agenda de serviços (F7): um ritual publicado com duração ocupa a agenda de atendimentos
const EV5at = (await su.query(`select slot from available_slots($1, null, 7) offset 3 limit 1`, [SV])).rows[0].slot;
const pre = (await su.query(`select count(*)::int n from available_slots($1, null, 7) where slot=$2`, [SV, EV5at])).rows[0].n;
ok("F7 (pré-condição): o horário escolhido estava livre antes do ritual", pre === 1, `aparições=${pre}`);
await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status${DC}) values ($1,'Ritual no horário de atendimento','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,$2,'publicado'${DV})`, [HA, EV5at]).catch((e) => info("ritual no horário", e.message));
const clash = (await su.query(`select count(*)::int n from available_slots($1, null, 7) where slot=$2`, [SV, EV5at])).rows[0].n;
ok("F7: ritual publicado (com duração) ocupa o horário na agenda de atendimentos", MAX < 67 ? clash === 0 : clash === 0, clash ? "o horário CONTINUA disponível para agendamento" : "horário bloqueado");
if (MAX >= 67) {
  const noDur = await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status) values ($1,'Sem duração','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,now()+interval '9 days','publicado')`, [HA]).then(() => null, (e) => e.message);
  ok("F7: publicar ritual sem duração é recusado", Boolean(noDur), noDur ?? "aceito");
  const draft = await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status) values ($1,'Rascunho','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,now()+interval '9 days','rascunho') returning id`, [HA]).then((r) => r.rows[0].id, (e) => null);
  ok("F7: rascunho sem duração continua permitido", Boolean(draft));
  const badDur = await su.query(`update events set duration_min=5 where id=$1`, [draft]).then(() => null, (e) => e.message);
  ok("F7: duração fora de 15–1440 min é recusada", Boolean(badDur), badDur ?? "aceita");
  const ordSlot = (await su.query(`select scheduled_at s, ends_at e from service_orders where house_id=$1 and scheduled_at=$2 and status in ('aguardando_pagamento','confirmado') limit 1`, [HA, slot])).rows[0];
  const conflict = await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Choca com atendimento','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,$2,'publicado',90)`, [HA, ordSlot.s]).then(() => null, (e) => e.message);
  ok("F7: ritual sobreposto a atendimento já marcado é recusado", Boolean(conflict), conflict ?? "aceito");
  // corrida: publicar ritual e agendar o MESMO horário ao mesmo tempo => no máximo um dos dois
  let both = 0; const R = 12;
  for (let i = 0; i < R; i++) {
    const slots = (await su.query(`select slot from available_slots($1, null, 14) offset $2 limit 1`, [SV, 10 + i])).rows[0]?.slot; if (!slots) break;
    const evId = (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status) values ($1,'Corrida','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,$2,'rascunho') returning id`, [HA, slots])).rows[0].id;
    const [pub, bkg] = await Promise.all([
      as("authenticated", U.A, (c) => q(c, `update events set status='publicado', duration_min=60 where id=$1`, [evId])),
      as("authenticated", [U.D, U.T, U.S, U.C][i % 4], (c) => q(c, `select create_booking($1,$2,null) id`, [SV, slots])),
    ]);
    if (!pub.err && !bkg.err) both++;
    await su.query(`delete from events where id=$1`, [evId]); await su.query(`delete from service_orders where scheduled_at=$1 and house_id=$2`, [slots, HA]);
  }
  ok(`F7: corrida ritual × agendamento no mesmo horário (${R} rodadas) nunca confirma os dois`, both === 0, `${both} rodada(s) com conflito`);
}
// F3: fronteira da janela de 1 hora
const mkEv = async (min) => (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status${DC}) values ($1,'Janela','Descrição longa o suficiente para passar na validação mínima de descrição do ritual.',5000,5,now() + make_interval(mins => $2::int),'publicado'${DV}) returning id`, [HA, min])).rows[0].id;
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
// Sem pedidos antigos da casa: o resultado não pode depender da hora do dia em que o teste roda.
await su.query(`delete from service_orders where house_id=$1`, [HA]).catch(() => null);
const e59 = await mkEv(59), e61 = await mkEv(61);
if (MAX >= 67) { ok("F3: a 59 min do início a reserva é recusada", Boolean((await as("authenticated", U.D, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [e59]))).err)); ok("F3: a 61 min do início a reserva é aceita", !(await as("authenticated", U.D, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [e61]))).err); }

if (MAX >= 69) {
  console.log("\n===== [6] F6: trilha de auditoria da equipe =====");
  const X = "e1000000-0000-0000-0000-0000000000e1", AD = "ad000000-0000-0000-0000-0000000000a6", HZ = "cc000000-0000-0000-0000-0000000000cc", OZ = "e2000000-0000-0000-0000-0000000000e2";
  for (const [id, nm] of [[X, "Pessoa Equipe"], [AD, "Admin Seis"], [OZ, "Dono Casa Z"]]) { await su.query(`insert into auth.users(id,email) values ($1,$2) on conflict do nothing`, [id, nm.replace(" ", "") + "@x"]); await su.query(`insert into profiles(id,account_type,display_name) values ($1,'cliente',$2) on conflict do nothing`, [id, nm]); }
  await su.query(`insert into admins(user_id) values ($1) on conflict do nothing`, [AD]);
  await su.query("set session_replication_role = replica");
  await su.query(`insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Z','casa-z','maximo') on conflict do nothing`, [HZ, OZ]);
  await su.query("set session_replication_role = origin");
  const audit = async (house, where = "") => (await su.query(`select action, actor_role, target_name, details, actor_id, target_user_id from staff_audit where house_id=$1 ${where} order by id`, [house])).rows;
  const acts = (rows) => rows.map((r) => r.action).join(",");
  await su.query(`delete from staff_audit where house_id=$1`, [HZ]);

  // 1) convite
  const iv = await as("authenticated", OZ, (c) => q(c, `insert into house_staff_invites(house_id,name,perms) values ($1,'Atendente X',array['chat_reply','orders']) returning token`, [HZ]));
  let rows = await audit(HZ);
  ok("F6: criar convite gera 1 registro 'convite_criado' feito pelo dono", acts(rows) === "convite_criado" && rows[0].actor_role === "dono" && rows[0].actor_id === OZ && rows[0].target_name === "Atendente X", acts(rows));
  ok("F6: o registro do convite NÃO guarda o token", !JSON.stringify(rows[0]?.details ?? {}).includes(iv.rows?.[0]?.token ?? "tokenausente"));
  // 2) aceite
  const acc = await as("authenticated", X, (c) => q(c, `select accept_staff_invite($1)`, [iv.rows[0].token]));
  rows = await audit(HZ);
  ok("F6: aceitar o convite gera 'aceito' (feito pela própria pessoa da equipe)", acts(rows) === "convite_criado,aceito" && rows[1].actor_role === "equipe" && rows[1].target_user_id === X, acc.err ?? acts(rows));
  // 3) pausa / reativação / permissões / nome
  await as("authenticated", OZ, (c) => q(c, `update house_staff set active=false where house_id=$1 and user_id=$2`, [HZ, X]));
  await as("authenticated", OZ, (c) => q(c, `update house_staff set active=true where house_id=$1 and user_id=$2`, [HZ, X]));
  rows = await audit(HZ, "and id > (select min(id) from staff_audit where house_id=$1 and action='aceito')");
  ok("F6: pausar e reativar geram 2 registros, nessa ordem, feitos pelo dono", acts(rows) === "pausado,reativado" && rows.every((r) => r.actor_role === "dono"), acts(rows));
  await as("authenticated", OZ, (c) => q(c, `update house_staff set perms=array['chat_read','post'] where house_id=$1 and user_id=$2`, [HZ, X]));
  rows = await audit(HZ, "and action='permissoes_alteradas'");
  ok("F6: mudar permissões guarda a lista antes e depois", rows.length === 1 && JSON.stringify(rows[0].details.antes) === JSON.stringify(["chat_reply", "orders"]) && JSON.stringify(rows[0].details.depois) === JSON.stringify(["chat_read", "post"]), JSON.stringify(rows[0]?.details));
  await as("authenticated", OZ, (c) => q(c, `update house_staff set perms=array['chat_read','post'] where house_id=$1 and user_id=$2`, [HZ, X]));
  ok("F6: salvar as mesmas permissões não gera registro novo", (await audit(HZ, "and action='permissoes_alteradas'")).length === 1);
  const before = (await audit(HZ)).length;
  await as("authenticated", OZ, (c) => q(c, `update house_staff set name='Nome Novo', active=false, perms=array['stats'] where house_id=$1 and user_id=$2`, [HZ, X]));
  const multi = (await audit(HZ)).slice(before);
  ok("F6: uma alteração com 3 mudanças gera 3 registros (pausa, permissões, nome)", multi.length === 3 && new Set(multi.map((r) => r.action)).size === 3 && ["pausado", "permissoes_alteradas", "nome_alterado"].every((a) => acts(multi).includes(a)), acts(multi));
  // 4) a própria equipe não altera nem apaga o próprio vínculo (e nada é registrado)
  const cnt0 = (await audit(HZ)).length;
  const selfUp = await as("authenticated", X, (c) => q(c, `update house_staff set perms=array['chat_read','chat_reply','orders','post','calendar','members','stats'] where user_id=$1 returning id`, [X]));
  ok("F6: a pessoa da equipe não consegue ampliar as próprias permissões", (selfUp.err || selfUp.n === 0) && (await audit(HZ)).length === cnt0, selfUp.err ?? `${selfUp.n} linha(s)`);
  // 5) leitura
  const own = await as("authenticated", OZ, (c) => q(c, `select action from staff_audit`));
  ok("F6: o dono lê o histórico da própria casa", (own.rows ?? []).length === (await audit(HZ)).length && own.rows.length >= 8, `${own.rows?.length}`);
  for (const [who, uid] of [["dono de outra casa", U.B], ["cliente sem relação", U.D], ["a própria equipe", X]]) {
    const r = await as("authenticated", uid, (c) => q(c, `select id from staff_audit where house_id=$1`, [HZ]));
    ok(`F6: ${who} NÃO lê o histórico da Casa Z`, (r.rows ?? []).length === 0 && !r.err, r.err ?? `${r.rows.length} linha(s)`);
  }
  const an = await as("anon", null, (c) => q(c, `select id from staff_audit`));
  ok("F6: visitante (anon) não lê o histórico", Boolean(an.err) || an.rows.length === 0, an.err ?? "0 linhas");
  // 6) imutabilidade
  for (const [who, uid] of [["dono", OZ], ["equipe", X], ["administrador", AD]]) {
    const r1 = await as("authenticated", uid, (c) => q(c, `insert into staff_audit(house_id,action,actor_role) values ($1,'removido','dono')`, [HZ]));
    const r2 = await as("authenticated", uid, (c) => q(c, `update staff_audit set action='aceito' where house_id=$1 returning id`, [HZ]));
    const r3 = await as("authenticated", uid, (c) => q(c, `delete from staff_audit where house_id=$1 returning id`, [HZ]));
    ok(`F6: ${who} não insere, altera nem apaga o histórico`, Boolean(r1.err) && (r2.err || r2.n === 0) && (r3.err || r3.n === 0), `${r1.err?.slice(0, 40)} | ${r2.err ?? r2.n} | ${r3.err ?? r3.n}`);
  }
  const fnC = await as("authenticated", OZ, (c) => q(c, `select staff_audit_log($1,'removido',null,'x','{}'::jsonb)`, [HZ]));
  ok("F6: o dono não grava registro chamando a função interna", Boolean(fnC.err), fnC.err?.slice(0, 80));
  ok("F6: nada de falso entrou durante as tentativas", (await audit(HZ, "and action='aceito'")).length === 1 && (await audit(HZ, "and action='removido'")).length === 0);
  // 7) consulta da administração
  const nAdm0 = (await audit(HZ)).length;
  const e1 = await as("authenticated", OZ, (c) => q(c, `select * from admin_staff_audit($1,'quero ver')`, [HZ]));
  const e2 = await as("authenticated", X, (c) => q(c, `select * from admin_staff_audit($1,'quero ver')`, [HZ]));
  ok("F6: dono e equipe não usam a consulta da administração", Boolean(e1.err) && Boolean(e2.err) && (await audit(HZ)).length === nAdm0, `${e1.err?.slice(0, 40)} | ${e2.err?.slice(0, 40)}`);
  const an2 = await as("anon", null, (c) => q(c, `select * from admin_staff_audit($1,'quero ver')`, [HZ]));
  ok("F6: visitante não usa a consulta da administração", Boolean(an2.err));
  const noReason = await as("authenticated", AD, (c) => q(c, `select * from admin_staff_audit($1,'  ab ')`, [HZ]));
  const longReason = await as("authenticated", AD, (c) => q(c, `select * from admin_staff_audit($1,$2)`, [HZ, "x".repeat(301)]));
  const noHouse = await as("authenticated", AD, (c) => q(c, `select * from admin_staff_audit('99999999-9999-9999-9999-999999999999','investigação de denúncia')`));
  ok("F6: administração sem motivo válido (ou casa inexistente) é recusada e não deixa registro", Boolean(noReason.err) && Boolean(longReason.err) && Boolean(noHouse.err) && (await audit(HZ)).length === nAdm0);
  const okq = await as("authenticated", AD, (c) => q(c, `select action, actor_role from admin_staff_audit($1,'  investigação da denúncia 123 ')`, [HZ]));
  const regAdm = await audit(HZ, "and action='admin_consultou'");
  ok("F6: consulta válida devolve o histórico e registra 'admin_consultou' com motivo e autor", (okq.rows ?? []).length >= nAdm0 && regAdm.length === 1 && regAdm[0].actor_role === "admin" && regAdm[0].actor_id === AD && regAdm[0].details.motivo === "investigação da denúncia 123", okq.err ?? `${okq.rows?.length} linhas; ${regAdm.length} registro(s)`);
  const ownAfter = await as("authenticated", OZ, (c) => q(c, `select action from staff_audit`));
  ok("F6: o dono NÃO vê a consulta da administração", !(ownAfter.rows ?? []).some((r) => r.action === "admin_consultou") && ownAfter.rows.length === nAdm0, `${ownAfter.rows?.length} linhas`);
  const adm2 = await as("authenticated", AD, (c) => q(c, `select action from admin_staff_audit($1,'segunda consulta de rotina')`, [HZ]));
  ok("F6: a administração vê as próprias consultas anteriores", (adm2.rows ?? []).filter((r) => r.action === "admin_consultou").length >= 1, `${adm2.rows?.length}`);
  // 8) cancelar convite; convite usado apagado não gera registro
  await su.query(`insert into house_extra_seats(house_id,seats) values ($1,2) on conflict (house_id) do update set seats=2`, [HZ]);
  const iv2 = await as("authenticated", OZ, (c) => q(c, `insert into house_staff_invites(house_id,name) values ($1,'Convite Cancelado') returning token`, [HZ]));
  if (!iv2.rows) console.log("INFO iv2", iv2.err); await as("authenticated", OZ, (c) => q(c, `delete from house_staff_invites where token=$1`, [iv2.rows?.[0]?.token ?? ""]));
  ok("F6: cancelar convite gera 'convite_cancelado'", (await audit(HZ, "and action='convite_cancelado'")).length === 1);
  const nUsed = (await audit(HZ)).length;
  await as("authenticated", OZ, (c) => q(c, `delete from house_staff_invites where token=$1`, [iv.rows[0].token]));
  ok("F6: apagar convite já usado não gera registro enganoso", (await audit(HZ)).length === nUsed);
  // 9) remoção
  await as("authenticated", OZ, (c) => q(c, `delete from house_staff where house_id=$1 and user_id=$2`, [HZ, X]));
  rows = await audit(HZ, "and action='removido'");
  ok("F6: remover gera 'removido' feito pelo dono, com o nome e o alvo", rows.length === 1 && rows[0].actor_role === "dono" && rows[0].target_user_id === X && rows[0].target_name === "Nome Novo", acts(rows));
  // 10) retenção
  const d = (await su.query(`select (min(purge_after) between now() + interval '364 days' and now() + interval '366 days') ok from staff_audit where house_id=$1`, [HZ])).rows[0];
  ok("F6: cada registro nasce com validade de 12 meses", d.ok === true);
  await su.query(`update staff_audit set purge_after = now() - interval '1 day' where house_id=$1 and action='aceito'`, [HZ]);
  await su.query(`delete from public.staff_audit where purge_after < now()`);
  ok("F6: a limpeza apaga só o que venceu", (await audit(HZ, "and action='aceito'")).length === 0 && (await audit(HZ)).length > 5);
  // 11) apagar a casa com equipe não quebra e o histórico sobrevive (marcado como sistema)
  await su.query(`insert into house_staff(house_id,user_id,name,perms) values ($1,$2,'Volta','{chat_read}')`, [HZ, X]);
  const del = await su.query(`delete from houses where id=$1`, [HZ]).then(() => null, (e) => e.message);
  ok("F6: apagar uma casa com equipe vinculada não é bloqueado pela auditoria", del === null, del ?? "");
  ok("F6: o histórico da casa apagada permanece até vencer", (await audit(HZ)).length > 5);
  // 12) ACL medida no banco montado só pelas migrations (sem o ajuste do harness)
  console.log("INFO F6 ACL: conferida em banco separado montado só pelas migrations (ver README).");
}
console.log(`\nRESUMO probe${MAX}: ${out.filter((x) => x[0] === "PASS").length} PASS / ${out.filter((x) => x[0] === "FAIL").length} FAIL`);
for (const x of out.filter((x) => x[0] === "FAIL")) console.log("  FAIL:", x[1], "—", String(x[2]).slice(0, 200));
await su.end();

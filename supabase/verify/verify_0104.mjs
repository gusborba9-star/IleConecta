// Verificação LOCAL da migration 0104 (casa em bloqueio total ou inativa sai da vitrine; nada novo com ela).
// Uso: node supabase/verify/verify_0104.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const name = "vf0104";
const { c: su, failed } = await freshDb(name, { with64: true, max: 104 });
ok("migrations 0001–0104 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
// reaplica as permissões da própria migration (a concessão geral acima é só do ambiente de teste)
await su.query(readFileSync(new URL("../migrations/0104_vitrine_casa_bloqueada.sql", import.meta.url), "utf8").split("-- ============ 5) permissões ============")[1]);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
// consulta como visitante (anon, sem login) ou como usuário logado
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", uid ? "authenticated" : "anon"]); await c.query(uid ? "set role authenticated" : "set role anon"); return await fn(c); } finally { await c.end(); } };
// insere como o usuário (dispara os gatilhos com auth.uid() = uid), mas com permissão de escrita
const asWrite = async (uid, sql, p) => { await su.query("select set_config('test.uid',$1,false)", [uid ?? ""]); const r = await q(su, sql, p); await su.query("select set_config('test.uid','',false)"); return r; };

const u = (n) => `c0104000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
const [OWN_A, OWN_B, CLI, CLI2, ADM] = [u(1), u(2), u(3), u(4), u(5)];
const [HA, HB] = ["d0104000-0000-0000-0000-000000000001", "d0104000-0000-0000-0000-000000000002"];
for (const [id, tp] of [[OWN_A, "casa"], [OWN_B, "casa"], [CLI, "cliente"], [CLI2, "cliente"], [ADM, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${id}@x`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=$2", [id, tp]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','maximo'),($3,$4,'Casa B','casa-b','maximo')", [HA, OWN_A, HB, OWN_B]);
for (const [h, t] of [[HA, "A"], [HB, "B"]]) {
  await su.query("insert into posts(house_id,kind,content) values ($1,'geral',$2)", [h, `post ${t}`]);
  await su.query("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'trabalho','Servico ' || $2, 'Descricao do servico com tamanho suficiente para o teste', 5000, true)", [h, t]).catch(() => {});
}
const svc = await sv("select count(*) n from services");
await su.query("insert into events(house_id,title,description,price_cents,seats_total,starts_at,duration_min,status) values ($1,'Ritual A','Descricao do ritual com tamanho suficiente para o teste',1000,10,now()+interval '10 days',60,'publicado'),($2,'Ritual B','Descricao do ritual com tamanho suficiente para o teste',1000,10,now()+interval '10 days',60,'publicado')", [HA, HB]);
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
// plano matriculado nas duas casas
for (const h of [HA, HB]) await su.query("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date-40,true)", [h]);

const count = async (uid, table, where = "true") => (await as(uid, (c) => q(c, `select count(*) n from ${table} where ${where}`))).rows?.[0]?.n;
const nameSet = async (uid) => (await as(uid, (c) => q(c, "select name from houses order by name"))).rows.map((r) => r.name).join(",");

// ---- A) tudo normal: duas casas visíveis para todos
ok("A: visitante vê as duas casas", (await nameSet(null)) === "Casa A,Casa B");
ok("A: cliente vê as duas casas", (await nameSet(CLI)) === "Casa A,Casa B");
ok("A: visitante vê publicações e eventos das duas", Number(await count(null, "posts")) === 2 && Number(await count(null, "events")) === 2);

// ---- B) bloqueio TOTAL da casa A
await sv("insert into house_billing_state(house_id,suspended,since,total,total_since) values ($1,true,now(),true,now())", [HA]);
ok("B: visitante NÃO vê a casa bloqueada", (await nameSet(null)) === "Casa B");
ok("B: cliente NÃO vê a casa bloqueada", (await nameSet(CLI)) === "Casa B");
ok("B: publicações, eventos e serviços da casa bloqueada somem", Number(await count(null, "posts", `house_id='${HA}'`)) === 0 && Number(await count(null, "events", `house_id='${HA}'`)) === 0 && Number(await count(CLI, "services", `house_id='${HA}'`)) === 0);
ok("B: a casa normal continua com tudo", Number(await count(null, "posts", `house_id='${HB}'`)) === 1 && Number(await count(null, "events", `house_id='${HB}'`)) === 1);
ok("B: a dona vê a própria casa", (await nameSet(OWN_A)) === "Casa A,Casa B" && Number(await count(OWN_A, "posts", `house_id='${HA}'`)) === 1);
ok("B: a administração vê a casa", (await nameSet(ADM)) === "Casa A,Casa B");
const feat = await sv("insert into house_rewards(house_id,source,starts_at,expires_at) values ($1,'indicou',now()-interval '1 day',now()+interval '5 days'),($2,'indicou',now()-interval '1 day',now()+interval '5 days')", [HA, HB]);
if (feat.err) console.log("(house_rewards)", feat.err);
const hf = await as(CLI, (c) => q(c, "select public.house_featured() f"));
ok("B: a lista de casas em destaque não traz a casa bloqueada", !hf.err && !feat.err && !(OWN_A in (hf.rows[0].f ?? {})) && OWN_B in hf.rows[0].f, hf.err ?? JSON.stringify(hf.rows?.[0]?.f));

// ---- C) pedido em andamento: o cliente ainda vê, quem não tem pedido não
await sv("insert into services(id,house_id,kind,title,description,price_cents,active) values ('e0104000-0000-0000-0000-000000000001',$1,'trabalho','Serv A','Descricao do servico com tamanho suficiente para o teste',5000,true) on conflict do nothing", [HA]);
const ord = await sv("insert into service_orders(id,service_id,house_id,client_id,title,price_cents,status) values ('f0104000-0000-0000-0000-000000000001','e0104000-0000-0000-0000-000000000001',$1,$2,'Pedido',5000,'em_andamento')", [HA, CLI]);
ok("C: pedido de teste criado", !ord.err, ord.err);
ok("C: cliente com pedido em andamento AINDA vê a casa", (await nameSet(CLI)) === "Casa A,Casa B");
ok("C: outro cliente (sem pedido) não vê", (await nameSet(CLI2)) === "Casa B");
await sv("update service_orders set status='concluido' where id='f0104000-0000-0000-0000-000000000001'");
ok("C: concluído o pedido, o cliente também deixa de ver a casa", (await nameSet(CLI)) === "Casa B");
await sv("update service_orders set status='aguardando_pagamento' where id='f0104000-0000-0000-0000-000000000001'");
ok("C: pedido aguardando pagamento (não contratado) não mantém a casa visível", (await nameSet(CLI)) === "Casa B");
await sv("update service_orders set status='em_andamento' where id='f0104000-0000-0000-0000-000000000001'");

// ---- D) nada novo com a casa escondida (nem para quem tem pedido)
let r = await asWrite(CLI2, "insert into follows(follower_id,house_id) values ($1,$2)", [CLI2, HA]);
ok("D: seguir a casa escondida é recusado", !!r.err && /não está disponível/.test(r.err), r.err);
r = await asWrite(CLI, "insert into follows(follower_id,house_id) values ($1,$2)", [CLI, HA]);
ok("D: mesmo o cliente com pedido não segue a casa escondida", !!r.err && /não está disponível/.test(r.err), r.err);
r = await asWrite(CLI2, "insert into service_orders(service_id,house_id,client_id,title,price_cents,status) values ('e0104000-0000-0000-0000-000000000001',$1,$2,'Novo',5000,'confirmado')", [HA, CLI2]);
ok("D: pedido novo de serviço é recusado", !!r.err && /não está disponível/.test(r.err), r.err);
const evA = (await sv("select id from events where house_id=$1", [HA])).rows[0].id;
r = await asWrite(CLI2, "insert into reservations(event_id,user_id,status) values ($1,$2,'confirmada')", [evA, CLI2]);
ok("D: reserva de ritual é recusada", !!r.err && /não está disponível/.test(r.err), r.err);
r = await asWrite(CLI2, "insert into event_waitlist(event_id,user_id) values ($1,$2)", [evA, CLI2]);
ok("D: fila de espera é recusada", !!r.err && /não está disponível/.test(r.err), r.err);
r = await asWrite(CLI2, "select public.open_conversation($1)", [OWN_A]);
ok("D: conversa nova com a dona da casa escondida é recusada", !!r.err && /não está disponível/.test(r.err), r.err);
r = await asWrite(OWN_A, "select public.open_conversation($1)", [ADM]);
ok("D: a própria dona consegue falar com a administração (suporte)", !r.err, r.err);
r = await asWrite(ADM, "select public.open_conversation($1)", [OWN_A]);
ok("D: a administração consegue chamar a dona", !r.err, r.err);
r = await asWrite(CLI, "select public.open_conversation($1)", [OWN_A]);
ok("D: cliente com pedido em andamento consegue abrir conversa para concluir", !r.err, r.err);
r = await asWrite(CLI2, "insert into follows(follower_id,house_id) values ($1,$2)", [CLI2, HB]);
ok("D: casa normal segue funcionando (seguir)", !r.err, r.err);
r = await asWrite(CLI2, "select public.open_conversation($1)", [OWN_B]);
ok("D: casa normal segue funcionando (conversa)", !r.err, r.err);

// ---- E) casa inativa (assinatura cancelada) também some; reativada volta
await sv("delete from house_billing_state where house_id=$1", [HA]);
ok("E: sem bloqueio a casa A volta a aparecer", (await nameSet(CLI2)) === "Casa A,Casa B");
await sv("insert into house_billing_state(house_id,suspended,total,cancelled_at) values ($1,true,true,now())", [HA]);
ok("E: casa inativa (cancelada) some", (await nameSet(CLI2)) === "Casa B");
await sv("update house_billing_state set cancelled_at=null, suspended=false, total=false where house_id=$1", [HA]);
ok("E: casa reativada volta", (await nameSet(CLI2)) === "Casa A,Casa B");

// ---- F) suspensão parcial NÃO esconde
await sv("update house_billing_state set suspended=true where house_id=$1", [HA]);
ok("F: suspensão parcial não esconde a casa", (await nameSet(null)) === "Casa A,Casa B");
r = await asWrite(CLI2, "insert into follows(follower_id,house_id) values ($1,$2) on conflict do nothing", [CLI2, HA]);
ok("F: e ainda dá para seguir a casa em suspensão parcial", !r.err, r.err);

// ---- G) cobrança desligada: nada é escondido
await sv("update house_billing_state set suspended=true, total=true where house_id=$1", [HA]);
ok("G: com a cobrança ligada e bloqueio total, some", (await nameSet(null)) === "Casa B");
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'false') where key='billing_config'`);
ok("G: com a cobrança desligada, nada é escondido", (await nameSet(null)) === "Casa A,Casa B");
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);

// ---- H) calendário público e permissões
await sv("select 1");
const acl = (await sv(`select p.proname, array(select (a).grantee::regrole::text from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where (a).privilege_type='EXECUTE') g from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('house_is_hidden','house_has_open_ties','house_billing_on','hidden_house_new_guard','hidden_house_conversation_guard','house_visible_to_me')`)).rows;
ok("H: ajudantes internos NÃO são chamáveis por visitante nem por usuário (só a política de leitura)", acl.length === 6 && acl.filter((r) => r.g.includes("anon") || r.g.includes("authenticated")).map((r) => r.proname).join() === "house_visible_to_me", JSON.stringify(acl));
ok("H: a política de leitura funciona para visitante", (await as(null, (c) => q(c, "select public.house_visible_to_me($1) v", [HB]))).rows?.[0]?.v === true);
ok("H: sobram só as políticas esperadas (6 tabelas)", Number((await sv("select count(*) n from pg_policies where policyname='billing_hidden_sel'")).rows[0].n) === 6);
await su.end();
console.log(`\n${total - bad}/${total} verificações passaram`);
process.exit(bad ? 1 : 0);

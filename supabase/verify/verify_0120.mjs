// Verificação LOCAL da 0120 (moderação fase 1: contato externo recusado no plano Grátis). Uso: node supabase/verify/verify_0120.mjs (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const name = "vf0120";
const { c: su, failed } = await freshDb(name, { with64: true, max: 120 });
ok("migrations 0001–0120 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
const mig = readFileSync(new URL("../migrations/0120_moderacao_fase1_contato_externo.sql", import.meta.url), "utf8");
let again = null; try { await su.query(mig); } catch (e) { again = e.message; }
ok("0120 reaplica sem erro (idempotente)", again === null, again ?? "");
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;
  revoke execute on function public.contact_in_text(text), public.moderation_gratis_house(uuid), public.moderation_contact_message(), public.moderation_contact_guard() from public, anon, authenticated;`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (role, uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };

// ---- detector: textos que DEVEM ser barrados e textos legítimos que NÃO podem
const detect = async (t) => (await sv("select public.contact_in_text($1) r", [t])).rows[0].r;
const BLOCK = ["(11) 99999-9999", "11 99999 9999", "11999999999", "+55 11 99999-9999", "55 (51) 98888-7777", "whats 51 3333-4444", "meu zap 99999-9999", "chama no 11 9 9999 9999",
  "https://wa.me/5511999999999", "www.minhacasa.com.br", "minhacasa.com.br", "wa.me/5511999999999", "t.me/casa", "linktr.ee/casa", "instagram.com/casa", "@terreiropaijoao", "siga @casa_de_axe",
  "contato: fulano@gmail.com", "Terreiro Pai João - Whats (11) 99999-9999", "veja em casa.com", "bit.ly/abc123", "tel (21) 2222-3333", "ligue 21-2222-3333"];
const PASS = ["R$ 1.500,00", "R$ 199,00", "Casa 7 Encruzilhadas", "Ilê 2000", "19/11/2026 às 20:00", "CEP 90010-000", "Rua das Flores, 123", "Sessão de 40 minutos, 2 vezes por semana",
  "Trabalho para 21 dias", "Oxóssi e Ogum, 14 de novembro", "12x de 99,90", "Valor: R$ 2.500", "1.234.567 pessoas", "Atendimento de segunda a sexta, das 9h às 18h", "Ilê Axé Opô Afonjá", "Jogo de búzios completo.Venha conhecer",
  "Ritual de 3 horas com 15 vagas", "Terça 21/11 às 19:30", "Casa de Oxum - Salvador/BA", "Pix de R$ 50,00 para confirmar", "Quem aceita, aceita. Quem não aceita, respeita.", "Fale com a casa pelo chat", "Gratidão aos orixás e ancestrais", "Mensalidade de 150 reais, 4 encontros no mês", "Ano 2026, mês 11, dia 15"];
for (const t of BLOCK) ok(`barra: ${t}`, (await detect(t)) === true);
for (const t of PASS) ok(`libera: ${t}`, (await detect(t)) === false);
ok("texto vazio e nulo não barram", (await detect("")) === false && (await detect(null)) === false);

// ---- gatilhos
const U = { G: "c0120000-0000-0000-0000-00000000000a", P: "c0120000-0000-0000-0000-00000000000b", C: "c0120000-0000-0000-0000-00000000000c", A: "c0120000-0000-0000-0000-00000000000d" };
const HG = "d0120000-0000-0000-0000-0000000000aa", HP = "d0120000-0000-0000-0000-0000000000bb";
for (const [k, u] of Object.entries(U)) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, `${k}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set account_type=$2", [u, ["G", "P"].includes(k) ? "casa" : "cliente", "Pessoa " + k]);
}
await su.query("insert into public.admins(user_id) values ($1)", [U.A]);
await su.query("set session_replication_role = replica");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa gratis','casa-g','gratis'),($3,$4,'Casa paga','casa-p','maximo')", [HG, U.G, HP, U.P]);
await su.query("set session_replication_role = origin");
const MSG = "No Plano Grátis, a divulgação de contatos externos e links não é permitida. Utilize o chat da plataforma para atender seus clientes.";
const DESC = "Descrição longa o suficiente para passar na validação mínima de descrição.";
const tryAs = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));
let r;
r = await tryAs(U.G, "update houses set name='Casa gratis - Whats (11) 99999-9999' where id=$1", [HG]); ok("Grátis: nome da casa com telefone é recusado, com o texto aprovado", r.err === MSG && r.code === "P0001", r.err);
r = await tryAs(U.G, "update houses set name='Casa 7 Encruzilhadas' where id=$1", [HG]); ok("Grátis: nome legítimo com número passa", !r.err, r.err);
r = await tryAs(U.G, "update houses set offerings='me chame @casa' where id=$1", [HG]); ok("Grátis: ofertas com @ recusado", r.err === MSG, r.err);
r = await tryAs(U.G, "update profiles set bio='Veja www.casa.com.br' where id=$1", [U.G]); ok("Grátis: bio com link recusada", r.err === MSG, r.err);
r = await tryAs(U.G, "update profiles set bio='Casa de axé com 20 anos de tradição.' where id=$1", [U.G]); ok("Grátis: bio normal passa", !r.err, r.err);
r = await tryAs(U.G, "insert into services(house_id,kind,title,description,price_cents,active,delivery) values ($1,'buzios','Búzios (11) 99999-9999',$2,10000,true,'presencial')", [HG, DESC]); ok("Grátis: título de serviço com telefone recusado", r.err === MSG, r.err);
r = await tryAs(U.G, "insert into services(house_id,kind,title,description,price_cents,active,delivery) values ($1,'buzios','Jogo de búzios',$2,10000,true,'presencial')", [HG, DESC + " Chame no zap 11 99999-9999"]); ok("Grátis: descrição de serviço com telefone recusada", r.err === MSG, r.err);
r = await sv("insert into services(house_id,kind,title,description,price_cents,active,delivery) values ($1,'buzios','Jogo de búzios',$2,10000,true,'presencial') returning id", [HG, DESC]);
const SVC = r.rows?.[0]?.id;
r = await tryAs(U.G, "insert into events(house_id,title,description,price_cents,seats_total,starts_at,status) values ($1,'Ritual de Oxum',$2,5000,10,now()+interval '5 days','rascunho')", [HG, DESC + " Mais em instagram.com/casa"]); ok("Grátis: descrição de ritual com link recusada", r.err === MSG, r.err);
r = await tryAs(U.G, "insert into events(house_id,title,description,price_cents,seats_total,starts_at,status) values ($1,'Ritual de Oxum',$2,5000,10,now()+interval '5 days','rascunho')", [HG, DESC]); ok("Grátis: ritual normal passa", !r.err, r.err);
r = await tryAs(U.G, "insert into posts(house_id,kind,content) values ($1,'geral','Agende pelo 11 99999-9999')", [HG]); ok("Grátis: publicação com telefone recusada", r.err === MSG, r.err);
r = await tryAs(U.G, "insert into posts(house_id,kind,content) values ($1,'geral','Hoje tem gira às 19h, com 15 vagas. Venha!') returning id", [HG]); ok("Grátis: publicação normal passa", !r.err, r.err);
const POST = r.rows?.[0]?.id;
r = await tryAs(U.G, "insert into post_comments(post_id,user_id,text) values ($1,$2,'me chama no @casa')", [POST, U.G]); ok("Grátis: comentário da casa com @ recusado", r.err === MSG, r.err);
r = await tryAs(U.C, "insert into post_comments(post_id,user_id,text) values ($1,$2,'Meu contato é (11) 99999-9999')", [POST, U.C]); ok("cliente comum comenta com telefone: a regra é da casa Grátis, não do cliente", !r.err, r.err);
r = await tryAs(U.C, "update profiles set bio='Meu insta @cliente_axe' where id=$1", [U.C]); ok("bio de cliente não é restringida", !r.err, r.err);
r = await tryAs(U.P, "update houses set name='Casa paga (11) 99999-9999' where id=$1", [HP]); ok("plano pago: contato no nome é livre", !r.err, r.err);
r = await tryAs(U.P, "insert into posts(house_id,kind,content) values ($1,'geral','Agende: wa.me/5511999999999')", [HP]); ok("plano pago: publicação com contato é livre", !r.err, r.err);
r = await tryAs(U.P, "insert into services(house_id,kind,title,description,price_cents,active,delivery) values ($1,'buzios','Búzios',$2,10000,true,'presencial')", [HP, DESC + " (11) 99999-9999"]); ok("plano pago: descrição com telefone é livre", !r.err, r.err);
r = await tryAs(U.A, "update services set description=$2 where id=$1", [SVC, DESC + " (11) 99999-9999"]); ok("administração não é barrada pela regra", !r.err, r.err);
await sv("update services set description=$2 where id=$1", [SVC, DESC]);
// conteúdo antigo
await sv("update posts set content='Conteúdo antigo com (11) 99999-9999' where id=$1", [POST]);
r = await tryAs(U.G, "update posts set created_at=created_at where id=$1", [POST]); ok("conteúdo antigo com contato não é apagado nem quebra edições que não mexem no texto", !r.err, r.err);
r = await tryAs(U.G, "update posts set content='Conteúdo antigo com (11) 99999-9999 editado' where id=$1", [POST]); ok("editar o texto antigo mantendo o contato é recusado", r.err === MSG, r.err);
r = await tryAs(U.G, "update posts set content='Conteúdo sem contato' where id=$1", [POST]); ok("a casa corrige o texto e salva", !r.err, r.err);
// rotas de servidor
r = await sv("insert into posts(house_id,kind,content) values ($1,'geral','servidor com (11) 99999-9999')", [HG]); ok("chamada de servidor (service_role) não é barrada", !r.err, r.err);
// ACL
const priv = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
ok("funções internas fechadas para anon e authenticated", !(await priv("anon", "public.contact_in_text(text)")) && !(await priv("authenticated", "public.contact_in_text(text)")) && !(await priv("authenticated", "public.moderation_contact_guard()")) && !(await priv("authenticated", "public.moderation_gratis_house(uuid)")));
console.log(`\n${total - bad}/${total} aprovados`); await su.end(); process.exit(bad ? 1 : 0);

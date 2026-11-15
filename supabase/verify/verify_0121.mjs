// Verificação LOCAL da 0121 (moderação fase 2). Uso: node supabase/verify/verify_0121.mjs (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const name = "vf0121";
const { c: su, failed } = await freshDb(name, { with64: true, max: 121 });
ok("migrations 0001–0121 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
const mig = readFileSync(new URL("../migrations/0121_moderacao_fase2.sql", import.meta.url), "utf8");
let again = null; try { await su.query(mig); } catch (e) { again = e.message; }
ok("0121 reaplica sem erro (idempotente)", again === null, again ?? "");
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on public.services, public.events, public.posts to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;
  revoke all on table public.moderation_flags, public.moderation_settings from public, anon, authenticated;
  revoke execute on function public.promise_in_text(text), public.moderation_hidden_guard(), public.moderation_notify(uuid,text), public.moderation_promise_watch(), public.moderation_scan(), public.moderation_enforce(), public.contact_in_text(text) from public, anon, authenticated;
  revoke execute on function public.admin_moderation_list(text), public.admin_moderation_start_adaptation(), public.admin_moderation_scan(), public.admin_moderation_act(uuid,text,text), public.my_moderation_flags(), public.contest_moderation_flag(uuid,text) from public, anon;`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (role, uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const tryAs = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));

// ---- detector
const det = async (t) => (await sv("select public.promise_in_text($1) r", [t])).rows[0].r;
const BLOCK = ["Garantimos resultado em 7 dias", "Amarração garantida", "Resultado garantido ou seu dinheiro de volta", "100% garantido", "Trazemos seu amor de volta em 3 dias", "Cura garantida", "Garanto sucesso nos negócios", "Vitória garantida na justiça", "Eficácia comprovada", "Nunca falha", "resolvo em 48 horas seu problema amoroso", "Garantia de retorno do ser amado"];
const PASS = ["Vaga garantida para quem pagar até sexta", "Pagamento garantido pela plataforma", "Reserva garantida após o pagamento", "Jogo de búzios com orientação espiritual", "Ritual de 3 horas com 15 vagas", "Atendimento em 7 dias úteis após o pagamento", "Sessão de 40 minutos", "Acolhimento e escuta com respeito", "Consulta com resposta no mesmo dia", "Garantimos um espaço seguro e acolhedor", "Entrega do material em 5 dias", "Gira aberta ao público toda sexta"];
for (const t of BLOCK) ok(`sinaliza: ${t}`, (await det(t)) === true);
for (const t of PASS) ok(`não sinaliza: ${t}`, (await det(t)) === false);
ok("vazio e nulo", (await det("")) === false && (await det(null)) === false);

// ---- cenário
const U = { G: "c0121000-0000-0000-0000-00000000000a", P: "c0121000-0000-0000-0000-00000000000b", A: "c0121000-0000-0000-0000-00000000000d", O: "c0121000-0000-0000-0000-00000000000e", C: "c0121000-0000-0000-0000-00000000000c" };
const HG = "d0121000-0000-0000-0000-0000000000aa", HP = "d0121000-0000-0000-0000-0000000000bb";
for (const [k, u] of Object.entries(U)) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, `${k}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set account_type=$2", [u, ["G", "P"].includes(k) ? "casa" : "cliente", "Pessoa " + k]);
}
await su.query("insert into public.admins(user_id) values ($1)", [U.A]);
await su.query("set session_replication_role = replica");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa gratis','casa-g','gratis'),($3,$4,'Casa paga','casa-p','maximo')", [HG, U.G, HP, U.P]);
await su.query("set session_replication_role = origin");
const DESC = "Descrição longa o suficiente para passar na validação mínima de descrição.";
const ins = (h, title, desc) => sv("insert into services(house_id,kind,title,description,price_cents,active,delivery) values ($1,'buzios',$2,$3,10000,true,'presencial') returning id", [h, title, desc]);
const flags = async (t) => (await sv("select * from moderation_flags where target_id=$1 order by created_at", [t])).rows;
let r;

// publicar com promessa NÃO é recusado; cria chamado
r = await ins(HG, "Búzios com resultado garantido", DESC);
ok("promessa não é recusada na hora", !r.err, r.err);
const S1 = r.rows?.[0]?.id; let f = (await flags(S1))[0];
ok("chamado criado como pendente", f?.status === "pendente" && f.reason === "promessa" && f.house_id === HG);
r = await ins(HP, "Amarração garantida em 7 dias", DESC);
ok("vale também para plano pago", !r.err && (await flags(r.rows[0].id)).length === 1, r.err);
const S2 = r.rows?.[0]?.id;
const S3 = (await ins(HG, "Búzios", DESC)).rows[0].id;
ok("texto limpo não gera chamado", (await flags(S3)).length === 0);
r = await sv("update services set price_cents=12000 where id=$1", [S1]); ok("editar sem mexer no texto não duplica", !r.err && (await flags(S1)).length === 1);
r = await sv("update services set description=$2 where id=$1", [S1, DESC + " Outro texto, mas ainda resultado garantido."]); ok("editar mantendo a promessa não duplica", !r.err && (await flags(S1)).length === 1);

// posts e rituais
r = await tryAs(U.G, "insert into posts(house_id,kind,content) values ($1,'geral','Cura garantida para quem vier hoje') returning id", [HG]); ok("publicação com promessa: sinalizada", !r.err && (await flags(r.rows[0].id)).length === 1, r.err);
const P1 = r.rows?.[0]?.id;
r = await tryAs(U.P, "insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Ritual de Oxum',$2,5000,10,now()+interval '5 days','publicado',90) returning id", [HP, DESC + " Resultado garantido."]); ok("ritual com promessa: sinalizado", !r.err && (await flags(r.rows[0].id)).length === 1, r.err);

// permissões
r = await tryAs(U.G, "select * from admin_moderation_list()"); ok("casa não acessa a fila da administração", !!r.err, r.err);
r = await tryAs(U.G, "select * from moderation_flags"); ok("casa não lê a tabela da fila direto", !!r.err || r.rows.length === 0);
r = await tryAs(U.C, "select * from my_moderation_flags()"); ok("cliente sem casa vê lista vazia", !r.err && r.rows.length === 0, r.err);
r = await tryAs(U.G, "select * from my_moderation_flags()"); ok("casa não vê pendente (ainda não orientada)", !r.err && r.rows.length === 0, r.err);
r = await tryAs(U.G, "update services set moderation_hidden=true where id=$1", [S3]); ok("casa não consegue se ocultar nem forçar", !r.err && (await sv("select moderation_hidden h from services where id=$1", [S3])).rows[0].h === false);
r = await tryAs(U.P, "insert into services(house_id,kind,title,description,price_cents,active,delivery,moderation_hidden) values ($1,'buzios','Serviço novo',$2,10000,true,'presencial',true) returning moderation_hidden", [HP, DESC]); ok("insert com moderation_hidden=true é zerado", !r.err && r.rows[0].moderation_hidden === false, r.err);

// período de adaptação: só orientar
const act = (uid, id, a, note) => tryAs(uid, "select admin_moderation_act($1,$2,$3) r", [id, a, note ?? null]);
r = await act(U.G, f.id, "orientar"); ok("casa não pode orientar/advertir", !!r.err, r.err);
r = await act(U.A, f.id, "advertir"); ok("antes de iniciar a adaptação, advertência é barrada", /adapta/i.test(r.err ?? ""), r.err);
r = await act(U.A, f.id, "orientar", "ajuste o texto"); ok("administração orienta", !r.err && r.rows[0].r === "orientada", r.err);
r = await tryAs(U.G, "select * from my_moderation_flags()"); ok("casa passa a ver a orientação", !r.err && r.rows.length === 1 && r.rows[0].status === "orientada", r.err);
r = await sv("select count(*)::int n from notifications where user_id=$1 and href='/moderacao'", [U.G]); ok("casa recebeu notificação", r.rows[0].n === 1);
r = await tryAs(U.A, "select admin_moderation_start_adaptation() d"); ok("administração inicia a adaptação", !r.err && !!r.rows[0].d, r.err);
const d1 = r.rows?.[0]?.d; r = await tryAs(U.A, "select admin_moderation_start_adaptation() d"); ok("iniciar de novo não reinicia o relógio", !r.err && new Date(r.rows[0].d).getTime() === new Date(d1).getTime());
r = await act(U.A, f.id, "advertir"); ok("durante os 30 dias, advertência por promessa é barrada", /adapta/i.test(r.err ?? ""), r.err);
// fim da adaptação
await sv("update moderation_settings set adaptation_start = now() - interval '31 days'");
r = await act(U.A, f.id, "advertir"); ok("depois dos 30 dias, advertência é possível", !r.err && r.rows[0].r === "advertida", r.err);
f = (await flags(S1))[0];
const hrs = (new Date(f.deadline_at) - new Date(f.warned_at)) / 3600000;
ok("prazo de 72 horas", Math.abs(hrs - 72) < 0.01, hrs);
r = await sv("select count(*)::int n from notifications where user_id=$1 and text like 'Notificação de advertência%72 horas%'", [U.G]); ok("aviso cita 72 horas", r.rows[0].n === 1);
r = await act(U.A, f.id, "advertir"); ok("não advertir duas vezes", !!r.err, r.err);
// serviço continua visível antes do prazo
r = await as("anon", null, (c) => q(c, "select count(*)::int n from services where id=$1", [S1])); ok("antes do prazo o anúncio segue visível", r.rows?.[0]?.n === 1, r.err);

// prazo vence -> oculta só aquele anúncio
await sv("update moderation_flags set deadline_at = now() - interval '1 minute' where id=$1", [f.id]);
r = await tryAs(U.A, "select count(*)::int n from admin_moderation_list()"); ok("lista da administração aplica o prazo vencido", !r.err, r.err);
f = (await flags(S1))[0]; ok("anúncio ocultado e chamado em 'ocultada'", f.status === "ocultada" && !!f.hidden_at);
r = await as("anon", null, (c) => q(c, "select id from services where house_id=$1", [HG])); ok("visitante não vê o anúncio ocultado, mas vê os outros", r.rows.length >= 1 && !r.rows.some((x) => x.id === S1), r.err);
r = await tryAs(U.G, "select id from services where id=$1", [S1]); ok("a dona da casa ainda vê o anúncio ocultado", r.rows?.length === 1, r.err);
r = await as("anon", null, (c) => q(c, "select id from services where id=$1", [S3])); ok("outros anúncios da mesma casa seguem públicos", r.rows?.length === 1);
r = await as("anon", null, (c) => q(c, "select id from services where id=$1", [S2])); ok("anúncio de outra casa segue público (ainda sem advertência)", r.rows?.length === 1);

// contestação
r = await tryAs(U.G, "select contest_moderation_flag($1,'curto')", [f.id]); ok("contestação curta é recusada", !!r.err, r.err);
r = await tryAs(U.P, "select contest_moderation_flag($1,'Esta não é a minha casa, tentando')", [f.id]); ok("outra casa não contesta", !!r.err, r.err);
r = await tryAs(U.G, "select contest_moderation_flag($1,'O texto fala de acolhimento, não de promessa; peço revisão.')", [f.id]); ok("casa contesta dentro de 7 dias", !r.err, r.err);
f = (await flags(S1))[0]; ok("status contestada", f.status === "contestada" && !!f.contested_at);
r = await tryAs(U.G, "select contest_moderation_flag($1,'Segunda contestação sobre o mesmo caso.')", [f.id]); ok("não contesta duas vezes", !!r.err, r.err);
r = await sv("select count(*)::int n from notifications where user_id=$1 and text like 'Nova contestação%'", [U.A]); ok("administração é avisada da contestação", r.rows[0].n === 1);
r = await act(U.A, f.id, "manter", "Mantida"); ok("administração mantém a decisão", !r.err, r.err);
f = (await flags(S1))[0]; ok("volta para 'ocultada' com decisão mantida", f.status === "ocultada" && f.contest_decision === "mantida");
r = await tryAs(U.G, "select contest_moderation_flag($1,'Nova tentativa depois da decisão final.')", [f.id]); ok("depois de decidida, não contesta de novo", !!r.err, r.err);

// correção reabilita sozinha
r = await tryAs(U.G, "update services set title='Búzios com orientação', description=$2 where id=$1", [S1, DESC]); ok("casa corrige o texto", !r.err, r.err);
f = (await flags(S1))[0]; ok("chamado encerrado como corrigido", f.status === "encerrada" && f.outcome === "corrigido");
r = await as("anon", null, (c) => q(c, "select id from services where id=$1", [S1])); ok("anúncio volta a ficar público", r.rows?.length === 1, r.err);

// contestação aceita
const S4 = (await ins(HP, "Cura garantida na primeira sessão", DESC)).rows[0].id; f = (await flags(S4))[0];
await act(U.A, f.id, "orientar"); await act(U.A, f.id, "advertir");
r = await tryAs(U.P, "select contest_moderation_flag($1,'Está dentro das regras, peço a revisão do caso.')", [f.id]); ok("casa paga contesta antes de ocultar", !r.err, r.err);
r = await act(U.A, f.id, "encerrar", "Contestação aceita"); ok("administração aceita a contestação", !r.err, r.err);
f = (await flags(S4))[0]; ok("encerrada como contestação aceita", f.status === "encerrada" && f.outcome === "contestacao_aceita");

// prazo de contestação
const S5 = (await ins(HP, "Amarração garantida", DESC)).rows[0].id; f = (await flags(S5))[0];
await act(U.A, f.id, "orientar"); await act(U.A, f.id, "advertir");
await sv("update moderation_flags set warned_at = now() - interval '8 days', deadline_at = now() + interval '1 day' where id=$1", [f.id]);
r = await tryAs(U.P, "select contest_moderation_flag($1,'Contestando fora do prazo de sete dias.')", [f.id]); ok("depois de 7 dias não contesta", /7 dias/.test(r.err ?? ""), r.err);

// ocultar manual de publicação
f = (await flags(P1))[0]; await act(U.A, f.id, "orientar"); await act(U.A, f.id, "advertir");
r = await act(U.A, f.id, "ocultar"); ok("administração oculta publicação", !r.err, r.err);
r = await as("anon", null, (c) => q(c, "select id from posts where id=$1", [P1])); ok("publicação ocultada some para visitantes", r.rows?.length === 0, r.err);
r = await tryAs(U.G, "select id from posts where id=$1", [P1]); ok("dona ainda vê a publicação", r.rows?.length === 1);
r = await act(U.A, f.id, "encerrar"); r = await as("anon", null, (c) => q(c, "select id from posts where id=$1", [P1])); ok("encerrar devolve a publicação", r.rows?.length === 1);

// conteúdo antigo com contato (Grátis): 15 dias
await sv("set session_replication_role = replica");
const S6 = (await ins(HG, "Búzios", DESC + " Chame no 11 99999-9999")).rows[0].id;
await sv("set session_replication_role = origin");
r = await tryAs(U.A, "select admin_moderation_scan() n"); ok("varredura acha o contato antigo", !r.err && r.rows[0].n >= 1, r.err);
f = (await flags(S6))[0]; ok("chamado do tipo contato_antigo", f?.reason === "contato_antigo");
r = await act(U.A, f.id, "advertir"); ok("contato antigo pode ser advertido mesmo na adaptação (já passou)", !r.err, r.err);
f = (await flags(S6))[0]; const dd = (new Date(f.deadline_at) - new Date(f.warned_at)) / 86400000; ok("prazo de 15 dias para conteúdo antigo", Math.abs(dd - 15) < 0.01, dd);
r = await tryAs(U.G, "update services set description=$2 where id=$1", [S6, DESC]); f = (await flags(S6))[0];
ok("retirar o contato não encerra sozinho (só promessa fecha sozinha)", f.status === "advertida");
r = await tryAs(U.A, "select admin_moderation_act($1,'encerrar') r", [f.id]); ok("administração encerra após conferir", !r.err);
// idempotência da varredura
r = await tryAs(U.A, "select admin_moderation_scan() n"); ok("varredura repetida não duplica", !r.err && (await sv("select count(*)::int n from moderation_flags where target_id=$1 and status<>'encerrada'", [S6])).rows[0].n === 0, r.err);

// ACL
const priv = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
ok("internas fechadas", !(await priv("anon", "public.moderation_enforce()")) && !(await priv("authenticated", "public.moderation_enforce()")) && !(await priv("authenticated", "public.moderation_scan()")) && !(await priv("authenticated", "public.promise_in_text(text)")) && !(await priv("authenticated", "public.moderation_notify(uuid,text)")));
ok("rpc de administração e da casa fechadas para anon", !(await priv("anon", "public.admin_moderation_act(uuid,text,text)")) && !(await priv("anon", "public.contest_moderation_flag(uuid,text)")) && !(await priv("anon", "public.my_moderation_flags()")));
ok("tabelas sem acesso direto", !(await su.query("select has_table_privilege('authenticated','public.moderation_flags','select') x")).rows[0].x);
console.log(`\n${total - bad}/${total} aprovados`); await su.end(); process.exit(bad ? 1 : 0);

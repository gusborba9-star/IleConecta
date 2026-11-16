// Verificação LOCAL da migration 0134 (histórico de plano, dias de atividade e indicadores exatos).
// Uso: node supabase/verify/verify_0134.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0134";
const { c: su, failed } = await freshDb(name, { with64: true, max: 133 });
ok("migrations 0001–0133 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const MIGFILE = process.env.MIG_FILE ?? "0134_historico_de_plano_e_dias_de_atividade.sql";
const mig = readFileSync(new URL(`../migrations/${MIGFILE}`, import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0134 aplica e reaplica sem erro", e0 === null, e0 ?? "");
ok("cria exatamente 2 tabelas novas", (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n === tablesBefore + 2);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 160)); return r; };
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
const uuid = (p, i) => `${p}0134000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const T = (h) => `now() - interval '${h} hours'`;
const D = (d) => `now() - interval '${d} days'`;

const O6 = uuid("a", 6), O3 = uuid("a", 4), O4 = uuid("a", 5), ADM = uuid("a", 1), O1 = uuid("a", 2), O2 = uuid("a", 3), C1 = uuid("c", 1), C2 = uuid("c", 2), C3 = uuid("c", 3), NOADM = uuid("f", 1);
const mk = async (id, t, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(/\W/g, "")}${id.slice(-3)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set account_type=excluded.account_type", [id, t, nm]); };
for (const [id, t, nm] of [[ADM, "cliente", "Admin"], [O1, "casa", "Dona Um"], [O2, "casa", "Dona Dois"], [O3, "casa", "Dona Tres"], [O4, "casa", "Dona Quatro"], [O6, "casa", "Dona Seis"], [C1, "cliente", "Cli1"], [C2, "cliente", "Cli2"], [C3, "cliente", "Cli3"], [NOADM, "cliente", "Comum"]]) await mk(id, t, nm);
await su.query("insert into admins(user_id) values ($1)", [ADM]);
const H1 = uuid("d", 1), H2 = uuid("d", 2), H3 = uuid("d", 3), H4 = uuid("d", 4), H6 = uuid("d", 6);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','maximo'),($3,$4,'Casa Dois','casa-dois','base'),($5,$6,'Casa Tres','casa-tres','gratis'),($7,$8,'Casa Quatro','casa-quatro','intermediario')", [H1, O1, H2, O2, H3, O3, H4, O4]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Seis','casa-seis','gratis')", [H6, O6]);
// datas de criação: contas e casas
await force(`update profiles set created_at = ${D(200)}, last_seen_at = null`);
await force(`update profiles set created_at = ${D(5)} where id in ($1,$2,$3)`, [O1, O2, C1]);
await force(`update profiles set created_at = ${D(40)} where id = $1`, [C2]);
await force(`update profiles set last_seen_at = ${D(2)} where id in ($1,$2)`, [O1, C1]);
await force(`update profiles set last_seen_at = ${D(20)} where id = $1`, [C2]);
await force(`update houses set created_at = ${D(5)} where id = $1`, [H1]);
await force(`update houses set created_at = ${D(40)} where id in ($1,$2)`, [H2, H3]);
await force(`update houses set created_at = ${D(100)} where id = $1`, [H4]);
await force(`update houses set created_at = ${D(5)} where id = $1`, [H6]);
await force(`update profiles set created_at = ${D(200)} where id = $1`, [O6]);
// histórico de plano desenhado à mão (o gatilho criou linhas "inicio" agora; trocamos pelas do cenário)
await force("delete from house_plan_history");
const hp = (h, from, to, reason, ago) => force(`insert into house_plan_history(house_id,from_plan,to_plan,reason,created_at) values ($1,$2,$3,$4,${D(ago)})`, [h, from, to, reason]);
await hp(H1, null, "maximo", "inicio", 5);
await hp(H2, null, "gratis", "inicio", 40); await hp(H2, "gratis", "base", "subiu", 35);
await hp(H3, null, "gratis", "inicio", 60); await hp(H3, "gratis", "base", "subiu", 50); await hp(H3, "base", "gratis", "cancelou", 10);
await hp(H6, null, "gratis", "inicio", 5); await hp(H6, "gratis", "maximo", "admin", 4); await hp(H2, "maximo", "base", "rebaixou", 3);
await hp(H4, null, "intermediario", "inicio", 100); await hp(H4, "intermediario", "gratis", "cancelou", 40); await hp(H4, "gratis", "base", "subiu", 20); await hp(H4, "base", "gratis", "cancelou", 5);
// dias de atividade
const SPD = (n) => `((now() at time zone 'America/Sao_Paulo')::date - ${n})`;
const act = (u, n) => force(`insert into user_activity_days(user_id,day) values ($1,${SPD(n)}) on conflict do nothing`, [u]);
await act(ADM, 0); await act(O1, 0); await act(O1, 3); await act(O1, 40); await act(C1, 2); await act(C2, 40); await act(C2, 30); await act(O2, 5); await act(C3, 100);


// cobranças da plataforma
let seq = 0;
const ch = async (house, kind, st, paidAgo, amount, extra = {}) => (await force(`insert into platform_charges(house_id,kind,item_key,amount_cents,period_start,due_date,status,idempotency_key,paid_at,paid_amount_cents,created_at,updated_at)
  values ($1,$2,'k',$3,current_date - ${seq + 1}::int,${extra.due ?? "current_date"},$4,$5,${paidAgo ? D(paidAgo) : "null"},${paidAgo ? (extra.paid ?? amount) : "null"},${extra.created ?? "now()"},${extra.updated ?? "now()"}) returning id`, [house, kind, amount, st, `idem-0133-${++seq}-abcdef`])).rows?.[0]?.id;
const planCur = await ch(H1, "plan", "paga", 5, 8990);
await ch(H1, "extra_seat", "paga", 6, 2000);
await ch(H1, "highlight", "paga", 3, 1500);
await ch(H1, "boost", "paga", 10, 2500);
await ch(H1, "credit_pack", "paga", 4, 3500, { paid: 3000 });
await ch(H1, "plan", "paga", 40, 8990);
await ch(H2, "plan", "paga", 40, 8990);
await ch(H2, "plan", "paga", 100, 8990);          // fora das duas janelas
await ch(H2, "plan", "aberta", null, 8990);
await ch(H3, "plan", "aberta", null, 8990);
await ch(H3, "extra_seat", "paga", 100, 3000);
await ch(H4, "plan", "paga", 80, 8990);
await ch(H2, "boost", "aberta", null, 1500, { due: `(${D(7)})::date` });
await ch(H2, "highlight", "vencida", null, 1500, { due: `(${D(5)})::date` });
await ch(H2, "boost", "vencida", null, 1500, { due: `(${D(40)})::date` });
await ch(H2, "boost", "cancelada", null, 1500, { updated: D(5) });
await ch(H2, "boost", "cancelada", null, 1500, { updated: D(45) });

// pedidos, eventos, reservas
const ord = (h, c, st, ago) => force(`insert into service_orders(house_id,client_id,title,price_cents,status,created_at) values ($1,$2,'Trabalho',5000,$3,${D(ago)}) returning id`, [h, c, st]).then((r) => r.rows[0].id);
const O = []; for (let i = 0; i < 9; i++) O.push(await ord(i < 6 ? H1 : H2, C1, "concluido", 5));
const [o1, o2, o3, o4, o5, o6, o7, o8, o9] = O;
await force(`update service_orders set created_at = ${D(40)} where id = $1`, [o3]); await force(`update service_orders set created_at = ${D(100)} where id = $1`, [o8]);
const planH2 = await ch(H2, "plan", "paga", 41, 8990);
const evId = (await force(`insert into events(house_id,title,price_cents,seats_total,starts_at,status) values ($1,'Ritual',20000,10,now() + interval '3 days','publicado') returning id`, [H3])).rows[0].id;
const res1 = (await force(`insert into reservations(event_id,user_id,status,created_at) values ($1,$2,'confirmada',${D(6)}) returning id`, [evId, C1])).rows[0].id;
// pagamentos
const pay = async (ref, gross, fee, st, ago) => (await force(`insert into payments(${ref.col},provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method,created_at) values ($1,'stripe',$2,$3,'v2-2026-10',$4,now(),'pix',${D(ago)}) returning id`, [ref.id, gross, st, fee])).rows?.[0]?.id;
const OR = (id) => ({ col: "order_id", id }), RS = (id) => ({ col: "reservation_id", id });
const p1 = await pay(OR(o1), 10000, 1000, "confirmado", 5);
await pay(RS(res1), 20000, 2000, "confirmado", 6);
await pay(OR(o2), 7000, 700, "falhou", 5);
await pay(OR(o4), 6000, 600, "pendente", 5);
const pEst = await pay(OR(o5), 3000, 300, "estornado", 5);
await pay(OR(o6), 2500, 250, "estornado_parcial", 5);
await pay(OR(o7), 4000, 400, "contestado", 5);
await pay(OR(o3), 5000, 500, "confirmado", 40);
await pay(OR(o8), 9000, 900, "confirmado", 100);
await pay(OR(o9), 1500, 150, "pendente", 40);
// pagamento de mensalidade (sem pedido nem reserva): conta no volume mas não em "casas que venderam"
const due = (await force(`insert into member_dues(member_id,house_id,month,amount_cents,due_date,status,paid_via,paid_at) values (gen_random_uuid(),$1,date_trunc('month', now())::date,1000,current_date,'paga','app',now()) returning id`, [H2])).rows?.[0]?.id;
await force(`insert into payments(member_due_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method,created_at) values ($1,'stripe',1000,'confirmado','v2-2026-10',0,now(),'pix',${D(5)})`, [due]);
// reembolsos
const rr = (st, ago) => force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status,created_at) values ($1,$2,$3,$4,'antes_do_inicio','Não recebi o atendimento',1000,$5,${D(ago)})`, [p1, o1, H1, C1, st]);
await rr("reembolsado", 5); await rr("pendente", 6); await rr("reembolsado", 40); await rr("reembolsado", 100);
const pr = (st, amt, ago, h = H1, c = planCur) => force(`insert into platform_plan_refunds(charge_id,house_id,amount_cents,status,created_at) values ($1,$2,$3,$4,${D(ago)})`, [c, h, amt, st]);
await pr("concluido", 8990, 5); await pr("falhou", 5000, 5); await pr("falhou", 4000, 6); await pr("concluido", 1234, 40, H2, planH2);

// suporte
const sc = (kind, st, createdAgo, respH, dueH, resolvedAgo) => force(`insert into support_cases(kind,priority,status,opened_by,house_id,title,description,first_response_due,first_response_at,created_at,resolved_at)
  values ($1,'normal',$2,$3,$4,'Caso de teste','Descrição suficientemente longa do caso.', ${D(createdAgo)} + interval '${dueH} hours', ${respH === null ? "null" : `${D(createdAgo)} + interval '${respH} hours'`}, ${D(createdAgo)}, ${resolvedAgo === null ? "null" : D(resolvedAgo)})`, [kind, st, C1, H1]);
await sc("disputa", "resolvido", 5, 2, 4, 3);
await sc("golpe_fraude", "aberto", 5, 10, 4, null);
await sc("abuso", "aberto", 5, null, 4, null);
await sc("duvida", "aberto", 0.01, null, 72, null);
await sc("pagamento", "resolvido", 5, 1, 4, 2);
await sc("duvida", "resolvido", 40, 5, 24, 40);
await sc("duvida", "recusado", 100, 3, 24, 70);
await sc("duvida", "resolvido", 40, null, 24, 3);
await force(`update support_cases set status='em_analise' where kind='abuso'`);
await force(`update support_cases set status='aguardando_pessoa' where kind='golpe_fraude'`);

// IA
const ia = (p, c, ago) => force(`insert into assistant_usage(house_id,user_id,model,prompt_tokens,completion_tokens,created_at) values ($1,$2,'m',$3,$4,${D(ago)})`, [H1, C1, p, c]);
await ia(100, 50, 5); await ia(200, 80, 6); await ia(300, 20, 7); await ia(10, 5, 40); await ia(999, 999, 100);
// mensagens
const conv = async (a, b) => { const id = (await su.query("insert into conversations default values returning id")).rows[0].id; await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [id, a, b]); return id; };
const cv = await conv(O1, C1);
const msg = (sender, ago, asst = false) => force(`insert into messages(conversation_id,sender_id,text,created_at,from_assistant) values ($1,$2,'oi',${D(ago)},$3)`, [cv, sender, asst]);
for (const ago of [1, 2, 3, 4]) await msg(C1, ago);
await msg(O1, 2, true); await msg(O1, 3, true);
await msg(C1, 40); await msg(C1, 100);

const get = async (uid, days) => { const r = await as(uid, (c) => q(c, "select public.admin_indicators($1) r", [days === undefined ? 30 : days])); if (r.err) throw new Error(r.err); return r.rows[0].r; };
const M = (v, k, w = "current") => v.metrics[k][w];
const v = await get(ADM);

ok("período padrão de 30 dias e papéis", v.days === 30 && Object.keys(v.metrics).length >= 30);
// crescimento
ok("novas contas (atual / anterior)", M(v, "novas_contas") === 3 && M(v, "novas_contas", "previous") === 1, JSON.stringify(v.metrics.novas_contas));
ok("novas casas", M(v, "novas_casas") === 2 && M(v, "novas_casas", "previous") === 2);
ok("novas casas pagantes (criadas no período e com plano pago)", M(v, "novas_casas_pagantes") === 1 && M(v, "novas_casas_pagantes", "previous") === 2);
// volume
ok("volume só dos pagamentos confirmados no período (inclui mensalidade)", M(v, "volume_cents") === 31000 && M(v, "volume_cents", "previous") === 5000, JSON.stringify(v.metrics.volume_cents));
ok("comissão soma a taxa dos confirmados", M(v, "comissao_cents") === 3000 && M(v, "comissao_cents", "previous") === 500, JSON.stringify(v.metrics.comissao_cents));
ok("casas que venderam (pedido, reserva ou mensalidade de membro)", M(v, "casas_que_venderam") === 3 && M(v, "casas_que_venderam", "previous") === 1, JSON.stringify(v.metrics.casas_que_venderam));
// receita
ok("receita de assinatura = plano + vaga extra, pagas no período", M(v, "receita_assinatura_cents") === 10990 && M(v, "receita_assinatura_cents", "previous") === 26970, JSON.stringify(v.metrics.receita_assinatura_cents));
ok("receita de divulgação = destaque + impulsionamento", M(v, "receita_divulgacao_cents") === 4000 && M(v, "receita_divulgacao_cents", "previous") === 0, JSON.stringify(v.metrics.receita_divulgacao_cents));
ok("receita de créditos", M(v, "receita_creditos_cents") === 3000 && M(v, "receita_creditos_cents", "previous") === 0);
ok("cobranças vencidas pelo vencimento", M(v, "cobrancas_vencidas") === 1 && M(v, "cobrancas_vencidas", "previous") === 1, JSON.stringify(v.metrics.cobrancas_vencidas));
ok("cobranças canceladas pela data de atualização", M(v, "cobrancas_canceladas") === 1 && M(v, "cobrancas_canceladas", "previous") === 1, JSON.stringify(v.metrics.cobrancas_canceladas));
// reembolsos
ok("pedidos de reembolso e feitos", M(v, "reembolsos_pedidos") === 2 && M(v, "reembolsos_feitos") === 1 && M(v, "reembolsos_pedidos", "previous") === 1 && M(v, "reembolsos_feitos", "previous") === 1, JSON.stringify(v.metrics.reembolsos_pedidos));
ok("pagamentos estornados (total e parcial)", M(v, "pagamentos_estornados") === 2 && M(v, "pagamentos_estornados", "previous") === 0);
ok("reembolsos de plano só os concluídos", M(v, "reembolsos_plano_cents") === 8990 && M(v, "reembolsos_plano_cents", "previous") === 1234, JSON.stringify(v.metrics.reembolsos_plano_cents));
// disputas e incidentes
ok("pagamentos contestados", M(v, "pagamentos_contestados") === 1 && M(v, "pagamentos_contestados", "previous") === 0);
ok("casos de disputa", M(v, "casos_disputa") === 1 && M(v, "casos_disputa", "previous") === 0);
ok("incidentes = risco de vida, golpe e abuso", M(v, "incidentes") === 2 && M(v, "incidentes", "previous") === 0, JSON.stringify(v.metrics.incidentes));
// atendimento
ok("casos abertos no período", M(v, "casos_abertos") === 5 && M(v, "casos_abertos", "previous") === 2, JSON.stringify(v.metrics.casos_abertos));
ok("casos resolvidos pela data de resolução", M(v, "casos_resolvidos") === 3 && M(v, "casos_resolvidos", "previous") === 1, JSON.stringify(v.metrics.casos_resolvidos));
ok("casos com resposta e no prazo", M(v, "casos_com_resposta") === 3 && M(v, "casos_resposta_no_prazo") === 2 && M(v, "casos_com_resposta", "previous") === 1 && M(v, "casos_resposta_no_prazo", "previous") === 1);
ok("casos sem resposta com prazo vencido (prazo ainda aberto não conta)", M(v, "casos_sem_resposta_no_prazo") === 1 && M(v, "casos_sem_resposta_no_prazo", "previous") === 1, JSON.stringify(v.metrics.casos_sem_resposta_no_prazo));
ok("primeira resposta: mediana em horas", Number(M(v, "primeira_resposta_mediana_h")) === 2 && Number(M(v, "primeira_resposta_mediana_h", "previous")) === 5, JSON.stringify(v.metrics.primeira_resposta_mediana_h));
// IA e recursos
ok("IA: respostas e tokens", M(v, "ia_respostas") === 3 && M(v, "ia_tokens_entrada") === 600 && M(v, "ia_tokens_saida") === 150 && M(v, "ia_respostas", "previous") === 1 && M(v, "ia_tokens_entrada", "previous") === 10, JSON.stringify(v.metrics.ia_tokens_entrada));
ok("mensagens não contam as da assistente", M(v, "mensagens") === 4 && M(v, "mensagens", "previous") === 1, JSON.stringify(v.metrics.mensagens));
ok("pedidos e reservas criados", M(v, "pedidos_criados") === 7 && M(v, "pedidos_criados", "previous") === 1 && M(v, "reservas_criadas") === 1 && M(v, "reservas_criadas", "previous") === 0, JSON.stringify([v.metrics.pedidos_criados, v.metrics.reservas_criadas]));
// momento
const s = v.snapshot;
ok("totais e casas por plano", s.usuarios_total === 10 && s.casas_total === 5 && s.casas_por_plano.maximo === 1 && s.casas_por_plano.base === 1 && s.casas_por_plano.gratis === 2 && s.casas_por_plano.intermediario === 1, JSON.stringify(s.casas_por_plano));
ok("ativos 7d e 30d", s.ativos_7d === 2 && s.ativos_30d === 3 && s.casas_ativas_30d === 1, JSON.stringify([s.ativos_7d, s.ativos_30d, s.casas_ativas_30d]));
ok("retenção: base e retidos", s.assinantes_base === 2 && s.assinantes_retidos === 1 && s.atividade_desde !== null, JSON.stringify([s.assinantes_base, s.assinantes_retidos]));
ok("casos em aberto (exclui resolvido e recusado)", s.casos_em_aberto === 3, String(s.casos_em_aberto));

// períodos
const v7 = await get(ADM, 7), v90 = await get(ADM, 90), vx = await get(ADM, 5), vn = await get(ADM, null);
ok("7 dias: janela curta", v7.days === 7 && M(v7, "volume_cents") === 31000 && M(v7, "volume_cents", "previous") === 0, JSON.stringify(v7.metrics.volume_cents));
ok("90 dias: pega o que estava no anterior do período de 30", v90.days === 90 && M(v90, "volume_cents") === 36000 && M(v90, "volume_cents", "previous") === 9000, JSON.stringify(v90.metrics.volume_cents));
ok("período inválido vira 30", vx.days === 30 && vn.days === 30);

// acesso
const nope = await as(NOADM, (c) => q(c, "select public.admin_indicators(30)"));
ok("quem não é administração é recusado", /not_admin/.test(nope.err ?? ""), nope.err);
const owner = await as(O1, (c) => q(c, "select public.admin_indicators(30)"));
ok("dona de casa é recusada", /not_admin/.test(owner.err ?? ""));
const anon = await as(null, (c) => q(c, "select public.admin_indicators(30)"), "anon");
ok("anônimo não executa", !!anon.err, anon.err);
const acl = await sv("select r.rolname from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a join pg_roles r on r.oid = a.grantee where p.proname='admin_indicators' and p.pronamespace='public'::regnamespace and a.privilege_type='EXECUTE' order by 1");
ok("só authenticated (e donos) têm execute", !acl.rows.some((r) => ["anon", "public", ""].includes(r.rolname)) && acl.rows.some((r) => r.rolname === "authenticated"), JSON.stringify(acl.rows));
const fn = await sv("select provolatile v, prosecdef d, proconfig c from pg_proc where proname='admin_indicators'");
ok("função 'stable', security definer, search_path fixo", fn.rows[0].v === "s" && fn.rows[0].d === true && /search_path=public/.test(String(fn.rows[0].c)));
const snap = async () => (await sv(`select (select count(*) from payments)::int a, (select count(*) from platform_charges)::int b, (select count(*) from support_cases)::int c, (select count(*) from admin_audit)::int d, (select count(*) from profiles)::int e`)).rows[0];
const a1 = await snap(); await get(ADM); await get(ADM, 90); const a2 = await snap();
ok("consultar não altera nada (nem a auditoria)", JSON.stringify(a1) === JSON.stringify(a2));

// ---- novos indicadores exatos
ok("cancelamentos vêm do histórico", M(v, "cancelamentos") === 2 && M(v, "cancelamentos", "previous") === 1, JSON.stringify(v.metrics.cancelamentos));
ok("ativos do período (dias de atividade, hoje incluso)", M(v, "ativos_no_periodo") === 4 && M(v, "ativos_no_periodo", "previous") === 2, JSON.stringify(v.metrics.ativos_no_periodo));
ok("casas ativas do período (titulares)", M(v, "casas_ativas_no_periodo") === 2 && M(v, "casas_ativas_no_periodo", "previous") === 1, JSON.stringify(v.metrics.casas_ativas_no_periodo));
const v7b = await get(ADM, 7);
ok("7 dias: 7 dias contados com hoje (sem emendar com o anterior)", M(v7b, "ativos_no_periodo") === 4 && M(v7b, "ativos_no_periodo", "previous") === 0, JSON.stringify(v7b.metrics.ativos_no_periodo));
ok("atividade_desde informa o primeiro dia registrado", String(v.snapshot.atividade_desde).slice(0, 10).length === 10);

// ---- gatilho do histórico de plano
const O5 = uuid("a", 9), H5 = uuid("d", 9);
await mk(O5, "casa", "Dona Cinco");
const hist = async () => (await sv("select from_plan f, to_plan t, reason r from house_plan_history where house_id=$1 order by created_at, id", [H5])).rows.map((x) => `${x.f ?? "-"}>${x.t}:${x.r}`);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Cinco','casa-cinco','base')", [H5, O5]);
ok("casa nova entra no histórico como 'inicio'", (await hist()).join() === "-" + ">base:inicio", (await hist()).join());
await su.query("select set_config('app.admin_plan','on',false)");
const setPlan = (pl) => su.query("update houses set plan=$2 where id=$1", [H5, pl]);
await setPlan("maximo"); await setPlan("base"); await setPlan("intermediario"); await setPlan("maximo"); await setPlan("intermediario"); await setPlan("gratis"); await setPlan("base");
ok("subiu, rebaixou, cancelou (volta ao Grátis) e subiu de novo", (await hist()).slice(1).join() === "base>maximo:subiu,maximo>base:rebaixou,base>intermediario:subiu,intermediario>maximo:subiu,maximo>intermediario:rebaixou,intermediario>gratis:cancelou,gratis>base:subiu", (await hist()).join());
const n1 = (await hist()).length;
await setPlan("base"); await su.query("update houses set name='Casa Cinco B' where id=$1", [H5]);
ok("mesma opção ou outro campo não gera linha", (await hist()).length === n1);
await su.query("select set_config('app.admin_plan','off',false)");
const own = await as(O5, (c) => q(c, "update houses set plan='maximo' where id=$1", [H5]));
ok("a dona não troca o próprio plano e nada é registrado", (await hist()).length === n1 && (await cnt("select count(*)::int n from houses where id=$1 and plan='base'", [H5])) === 1, own.err ?? "");
const adm = await as(ADM, (c) => q(c, "select public.admin_set_house_plan($1,'maximo',null,null)", [H5]));
ok("troca feita pela administração é 'admin'", !adm.err && (await hist()).slice(-1)[0] === "base>maximo:admin", adm.err ?? (await hist()).slice(-1)[0]);
const adm2 = await as(ADM, (c) => q(c, "select public.admin_set_house_plan($1,'base','maximo', now() + interval '2 days')", [H5]));
ok("degustação dada pela administração também é 'admin'", !adm2.err && (await hist()).slice(-1)[0] === "maximo>base:admin", adm2.err ?? "");
await su.query("select set_config('app.admin_plan','on',false)");
await su.query("update houses set plan='maximo', plan_revert_to='base', plan_revert_at = now() - interval '1 minute' where id=$1", [H5]);
const before = (await hist()).length;
await su.query("update houses set plan = plan_revert_to, plan_revert_to = null, plan_revert_at = null where plan_revert_at is not null and plan_revert_at <= now()");
ok("fim da degustação não conta como cancelamento nem rebaixa", (await hist()).slice(before).join() === "maximo>base:admin", (await hist()).slice(before).join());
await su.query("update houses set plan='base', plan_revert_to='gratis', plan_revert_at = now() + interval '3 days' where id=$1", [H5]);
const b2 = (await hist()).length;
await su.query("update houses set plan='maximo', plan_revert_to=null, plan_revert_at=null where id=$1", [H5]);
ok("degustação encerrada por subida de plano não vira 'admin'", (await hist()).slice(b2).join() === "base>maximo:subiu", (await hist()).slice(b2).join());
await su.query("select set_config('app.admin_plan','off',false)");
await su.query("delete from houses where id=$1", [H5]);
ok("apagar a casa apaga o histórico dela", (await cnt("select count(*)::int n from house_plan_history where house_id=$1", [H5])) === 0);

// ---- acesso às tabelas e funções
for (const [who, uid, role] of [["autenticada", O1, "authenticated"], ["anônima", null, "anon"]]) {
  for (const t of ["house_plan_history", "user_activity_days"]) {
    const r = await as(uid, (c) => q(c, `select * from ${t}`), role); const w = await as(uid, (c) => q(c, `insert into ${t} select * from ${t} limit 0`), role);
    ok(`${who} não lê nem grava ${t}`, !!r.err && !!w.err, r.err ?? "");
  }
}
const tf = await as(O1, (c) => q(c, "select public.log_house_plan_change()"));
ok("ninguém chama a função do gatilho", !!tf.err, tf.err);
const rls = await sv("select relname, relrowsecurity from pg_class where relname in ('house_plan_history','user_activity_days') order by 1");
ok("segurança por linha ligada nas duas tabelas", rls.rows.length === 2 && rls.rows.every((x) => x.relrowsecurity), JSON.stringify(rls.rows));
const pol = await cnt("select count(*)::int n from pg_policies where tablename in ('house_plan_history','user_activity_days')");
ok("sem política (só o servidor lê)", pol === 0);
const aclTp = await sv("select r.rolname from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a join pg_roles r on r.oid=a.grantee where p.proname='touch_presence' and p.pronamespace='public'::regnamespace and a.privilege_type='EXECUTE'");
ok("touch_presence: só autenticados", aclTp.rows.some((x) => x.rolname === "authenticated") && !aclTp.rows.some((x) => ["anon", ""].includes(x.rolname)), JSON.stringify(aclTp.rows));

// ---- dias de atividade
const todaySP = (await sv("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
const tp = (u) => as(u, (c) => q(c, "select public.touch_presence()"));
const r1 = await tp(C3); const r2 = await tp(C3);
const rowsC3 = (await sv("select day::text d from user_activity_days where user_id=$1 order by day", [C3])).rows.map((x) => x.d);
ok("batimento grava o dia de hoje (Brasília) uma única vez", !r1.err && !r2.err && rowsC3.length === 2 && rowsC3[1] === todaySP, JSON.stringify(rowsC3));
const lsBefore = (await sv("select last_seen_at from profiles where id=$1", [C3])).rows[0].last_seen_at;
ok("batimento continua marcando o último acesso", lsBefore !== null);
await force("update profiles set deleted_at = now() where id=$1", [NOADM]);
await tp(NOADM);
ok("conta excluída não registra dia", (await cnt("select count(*)::int n from user_activity_days where user_id=$1", [NOADM])) === 0);
const anonTp = await as(null, (c) => q(c, "select public.touch_presence()"), "anon");
ok("anônimo não bate presença", !!anonTp.err, anonTp.err);
const nullUid = await as("", (c) => q(c, "select public.touch_presence()"));
ok("sem usuário logado nada é gravado", (await cnt("select count(*)::int n from user_activity_days where user_id is null")) === 0, nullUid.err ?? "");
const rowshape = await sv("select column_name from information_schema.columns where table_name='user_activity_days' order by 1");
ok("a tabela só guarda pessoa e dia (nada de conteúdo, tela ou horário)", rowshape.rows.map((x) => x.column_name).join() === "day,user_id", rowshape.rows.map((x) => x.column_name).join());

const U6 = uuid("b", 6), U7 = uuid("b", 7), U8 = uuid("b", 8), U9 = uuid("b", 9);
for (const [id, nm] of [[U6, "Fuso Um"], [U7, "Fuso Dois"], [U8, "Apagado"], [U9, "Antigo"]]) await mk(id, "cliente", nm);
for (const [u, tz] of [[U6, "Pacific/Kiritimati"], [U7, "Pacific/Pago_Pago"]]) await as(u, async (c) => { await c.query(`set time zone '${tz}'`); return q(c, "select public.touch_presence()"); });
const spToday = (await sv("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
const fuso = (await sv("select day::text d from user_activity_days where user_id in ($1,$2)", [U6, U7])).rows.map((x) => x.d);
ok("o dia é sempre o de Brasília, qualquer que seja o fuso da conexão", fuso.length === 2 && fuso.every((d) => d === spToday), JSON.stringify(fuso));
await su.query("delete from auth.users where id=$1", [U6]);
ok("apagar a pessoa apaga os dias dela (cascata)", (await cnt("select count(*)::int n from user_activity_days where user_id=$1", [U6])) === 0);
await force("update profiles set last_seen_at = now() - interval '3 days' where id=$1", [U9]);
await force("update profiles set last_seen_at = now() - interval '3 days', deleted_at = now() where id=$1", [U8]);
await su.query(mig);
const bf = await sv("select user_id, day::text d from user_activity_days where user_id in ($1,$2)", [U8, U9]);
const sp3 = (await sv("select ((now() - interval '3 days') at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
ok("reaplicar a migration traz o último acesso (e ignora conta excluída)", bf.rows.length === 1 && bf.rows[0].user_id === U9 && bf.rows[0].d === sp3, JSON.stringify(bf.rows));

// ---- baixar meus dados e exclusão
const ex = await as(O1, (c) => q(c, "select public.export_my_data() r"));
ok("baixar meus dados inclui só os meus dias de acesso", !ex.err && Array.isArray(ex.rows[0].r.dias_de_acesso) && ex.rows[0].r.dias_de_acesso.length === 4, ex.err ?? JSON.stringify(ex.rows?.[0]?.r?.dias_de_acesso));
const ex2 = await as(C1, (c) => q(c, "select public.export_my_data() r"));
ok("e os de outra pessoa não aparecem", !ex2.err && ex2.rows[0].r.dias_de_acesso.length === 1);
ok("baixar meus dados mantém as demais seções", Object.keys(ex.rows[0].r).includes("perfil") && Object.keys(ex.rows[0].r).includes("chamados") && Object.keys(ex.rows[0].r).includes("casas"));
const REQ = uuid("9", 1);
await force("insert into account_deletion_requests(id,user_id,status,execute_after) values ($1,$2,'pendente', now() - interval '1 minute')", [REQ, C3]);
const antes = await cnt("select count(*)::int n from user_activity_days where user_id=$1", [C3]);
const an = await as(null, (c) => q(c, "select public.anonymize_account($1, $2)", [C3, REQ]), "service_role");
ok("excluir a conta apaga os dias de atividade dela (e só os dela)", antes === 2 && !an.err && (await cnt("select count(*)::int n from user_activity_days where user_id=$1", [C3])) === 0 && (await cnt("select count(*)::int n from user_activity_days where user_id=$1", [C1])) === 1, an.err ?? "");
const anAuth = await as(O1, (c) => q(c, "select public.anonymize_account($1, $2)", [C1, REQ]));
ok("só o servidor anonimiza contas (recusa por permissão)", /permission denied/.test(anAuth.err ?? ""), anAuth.err);
const exAcl = await as(null, (c) => q(c, "select public.export_my_data()"), "anon");
ok("anônimo não baixa dados (recusa por permissão)", /permission denied/.test(exAcl.err ?? ""), exAcl.err);

// banco vazio e volume
await force("truncate house_plan_history, user_activity_days, payments, platform_charges, support_cases, assistant_usage, refund_requests, platform_plan_refunds cascade");
const vz = await get(ADM);
ok("sem movimento: tudo zero, medianas nulas", M(vz, "volume_cents") === 0 && M(vz, "receita_assinatura_cents") === 0 && M(vz, "primeira_resposta_mediana_h") === null && vz.snapshot.assinantes_base === 0 && vz.snapshot.casos_em_aberto === 0);
await su.query("set session_replication_role = replica");
await su.query(`insert into profiles(id,account_type,display_name,created_at,last_seen_at) select gen_random_uuid(),'cliente','Massa '||g, now() - (g || ' minutes')::interval, now() from generate_series(1,20000) g`);
await su.query(`insert into support_cases(kind,priority,status,opened_by,title,description,first_response_due,created_at) select 'duvida','normal','aberto',$1,'Caso '||g,'Descrição suficientemente longa.', now(), now() - (g || ' minutes')::interval from generate_series(1,5000) g`, [C1]);
await su.query("set session_replication_role = origin");
const t0 = Date.now(); const big = await get(ADM, 90); const ms = Date.now() - t0;
ok("com 20 mil contas e 5 mil casos ainda responde rápido", ms < 4000 && M(big, "novas_contas") >= 20000 && M(big, "casos_abertos") === 5000, `${ms} ms`);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

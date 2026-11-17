// Verificação LOCAL da migration 0136 (linha do tempo da casa (administração)).
// Uso: node supabase/verify/verify_0136.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0136";
const { c: su, failed } = await freshDb(name, { with64: true, max: 135 });
ok("migrations 0001–0135 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const MIGFILE = process.env.MIG_FILE ?? "0136_linha_do_tempo_da_casa_admin.sql";
const mig = readFileSync(new URL(`../migrations/${MIGFILE}`, import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0136 aplica e reaplica sem erro", e0 === null, e0 ?? "");
ok("não cria tabela nova", (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n === tablesBefore);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 160)); return r; };
const uuid = (p, i) => `${p}0136000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const T = (h) => `now() - interval '${h} hours'`;
const D = (d) => `now() - interval '${d} days'`;
const ADM = uuid("a", 1), O1 = uuid("a", 2), O2 = uuid("a", 3), C1 = uuid("c", 1), NOADM = uuid("f", 1);
const mk = async (id, t, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(/\W/g, "")}${id.slice(-3)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict do nothing", [id, t, nm]); };
for (const [id, t, nm] of [[ADM, "cliente", "Admin"], [O1, "casa", "Dona Um"], [O2, "casa", "Dona Dois"], [C1, "cliente", "Segredo Cliente"], [NOADM, "cliente", "Qualquer"]]) await mk(id, t, nm);
await su.query("insert into admins(user_id) values ($1)", [ADM]);
const H1 = uuid("d", 1), H2 = uuid("d", 2);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','base'),($3,$4,'Casa Dois','casa-dois','gratis')", [H1, O1, H2, O2]);
await force(`update houses set created_at = ${D(100)} where id = $1`, [H1]);
await force(`update houses set created_at = ${D(100)} where id = $1`, [H2]);
let seq = 0;
const ch = async (house, kind, st, createdDays, extra = {}) => (await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,paid_at,paid_amount_cents,provider_method,pix_discount_cents,pix_discount_until,created_at,updated_at)
  values ($1,$2,'k',$3,$4,current_date - ${++seq}::int,${extra.due ?? "current_date + 5"},$5,$6,${extra.paid ? D(extra.paid) : "null"},${extra.paid ? "$4" : "null"},${extra.paid ? "'pix'" : "null"},${extra.pixc ?? "0"},${extra.pixu ?? "null"},${D(createdDays)},${D(createdDays)}) returning id`, [house, kind, extra.desc ?? `Cobrança ${seq}`, extra.amount ?? 3990, st, `idem-0136-${seq}-abcdef`])).rows?.[0]?.id;
const c1 = await ch(H1, "plan", "paga", 60, { paid: 59, amount: 8990 });
await ch(H1, "extra_seat", "aberta", 3, { desc: "Vaga adicional", due: "current_date + 10", pixc: 400, pixu: "current_date + 3" });
await ch(H1, "boost", "vencida", 20, { due: "current_date - 4", pixc: 300, pixu: "current_date - 3" }); // desconto expirado: não vale
await ch(H1, "credit_pack", "cancelada", 15);
await ch(H1, "highlight", "aberta", 2, { pixc: 200, pixu: "(now() at time zone 'America/Sao_Paulo')::date" }); // último dia do desconto: ainda vale                                                          // não é "a pagar"
await ch(H2, "plan", "paga", 30, { paid: 29, amount: 7777 });                                          // outra casa: nunca aparece
// plano
await force(`delete from house_plan_history where house_id in ($1,$2)`, [H1, H2]);
await force(`insert into house_plan_history(house_id,from_plan,to_plan,reason,created_at) values ($1,null,'gratis','inicio',${D(100)}),($1,'gratis','base','subiu',${D(59)}),($2,null,'gratis','inicio',${D(100)}),($2,'gratis','base','subiu',${D(10)})`, [H1, H2]);
// reembolsos, moderação, suporte, avaliação
await force(`insert into platform_plan_refunds(charge_id,house_id,amount_cents,status,created_at) values ($1,$2,8990,'falhou',${D(50)})`, [c1, H1]);
await force(`insert into platform_plan_refunds(charge_id,house_id,amount_cents,status,created_at) values ($1,$2,7777,'concluido',${D(9)})`, [c1, H2]);
await force(`insert into platform_seat_refunds(charge_id,house_id,amount_cents,status,created_at) values ($1,$2,500,'pendente',${D(45)})`, [c1, H1]);
await force(`insert into platform_credit_refunds(charge_id,house_id,pack_id,credits,amount_cents,status,created_at) values ($1,$2,gen_random_uuid(),10,900,'falhou',${D(44)})`, [c1, H1]);
await force(`insert into promo_refunds(charge_id,house_id,promotion_id,reason,days_refunded,days_used,prev_days,amount_cents,status,created_at) values ($1,$2,gen_random_uuid(),'pedido',3,1,4,700,'falhou',${D(43)})`, [c1, H1]);
await force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status,created_at) values (gen_random_uuid(),gen_random_uuid(),$1,$2,'antes_do_inicio','MOTIVO PRIVADO DO CLIENTE',1000,'pendente',${D(30)})`, [H1, C1]);
await force(`insert into moderation_flags(house_id,target_table,target_id,reason,excerpt,status,created_at,contested_at) values ($1,'posts',gen_random_uuid(),'promessa','Promete cura garantida','contestada',${D(25)},${D(24)})`, [H1]);
await force(`insert into support_cases(kind,priority,status,opened_by,house_id,title,description,first_response_due,created_at) values ('duvida','normal','aberto',$1,$2,'Dúvida sobre cobrança','DESCRIÇÃO PRIVADA DO CASO',now(),${D(22)})`, [C1, H1]);
await force(`insert into reviews(service_order_id,house_id,author_id,rating,comment,anonymous,reported_at,report_reason,hidden,created_at) values (gen_random_uuid(),$1,$2,1,'COMENTÁRIO PRIVADO',false,${D(12)},'ofensiva',false,${D(13)})`, [H1, C1]);
// mensagens nunca entram
const conv = (await su.query("insert into conversations default values returning id")).rows[0].id;
await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [conv, O1, C1]);
await force(`insert into messages(conversation_id,sender_id,text,created_at) values ($1,$2,'MENSAGEM PRIVADA',${D(2)})`, [conv, C1]);

const tl = async (uid, house = H1, lim = 60, before = null) => as(uid, (c) => q(c, "select public.admin_house_timeline($1,$2,$3) r", [house, lim, before]));
const view = async (uid, ...a) => { const r = await tl(uid, ...a); if (r.err) throw new Error(r.err); return r.rows[0].r; };

// ---- acesso
const na = await tl(NOADM); ok("não-admin é recusado", /not_admin|permission|42501/i.test(na.err ?? ""), na.err);
const an = await as(null, (c) => q(c, "select public.admin_house_timeline($1)", [H1]), "anon"); ok("anon não tem execute", !!an.err && /permission denied/i.test(an.err), an.err);
const nulo = await tl(ADM, null); ok("casa nula: 'casa_inexistente'", /casa_inexistente/.test(nulo.err ?? ""), nulo.err);
const ine = await tl(ADM, uuid("9", 9)); ok("casa que não existe: 'casa_inexistente'", /casa_inexistente/.test(ine.err ?? ""), ine.err);
const owner = await tl(O1); ok("nem a titular da casa consulta (só administração)", /not_admin/.test(owner.err ?? ""), owner.err);

// ---- conteúdo
const v = await view(ADM);
const kinds = v.events.map((e) => e.kind);
ok("casa e plano", v.house.id === H1 && v.house.name === "Casa Um" && v.house.plan === "base");
for (const k of ["casa_criada", "plano", "fatura_emitida", "fatura_paga", "reembolso_plataforma", "reembolso_cliente", "moderacao", "moderacao_contestada", "suporte", "avaliacao_denunciada"]) ok(`evento '${k}' aparece`, kinds.includes(k), kinds.join());
ok("plano 'inicio' não duplica 'casa criada'", v.events.filter((e) => e.kind === "plano").length === 1 && v.events.filter((e) => e.kind === "plano")[0].title === "Plano: gratis → base");
ok("5 faturas emitidas (inclusive a cancelada) e 1 paga", kinds.filter((k) => k === "fatura_emitida").length === 5 && kinds.filter((k) => k === "fatura_paga").length === 1);
ok("reembolsos da plataforma: as 4 origens", v.events.filter((e) => e.kind === "reembolso_plataforma").map((e) => e.detail + ":" + e.status).sort().join() === "créditos:falhou,destaque:falhou,plano:falhou,vaga:pendente");
ok("ordem: mais recente primeiro", v.events.every((e, i) => i === 0 || e.at <= v.events[i - 1].at));
ok("termina na criação da casa", v.events.at(-1).kind === "casa_criada");
const txt = JSON.stringify(v);
ok("nunca devolve texto de conversa, motivo do cliente, comentário, descrição do caso, nome ou e-mail de cliente", !/MENSAGEM PRIVADA|MOTIVO PRIVADO|COMENTÁRIO PRIVADO|DESCRIÇÃO PRIVADA|Segredo Cliente|@x\.com/.test(txt), txt.slice(0, 200));
ok("não vaza nem o id do cliente", !txt.includes(C1));
const v2 = await view(ADM, H2);
ok("isolamento: a outra casa só vê o que é dela", !JSON.stringify(v2).includes("Cobrança 1") && v2.events.every((e) => !["reembolso_cliente", "moderacao", "suporte", "avaliacao_denunciada"].includes(e.kind)) && v2.events.some((e) => e.amount_cents === 7777));
ok("e a primeira não enxerga a fatura da outra", !v.events.some((e) => e.amount_cents === 7777));

// ---- a pagar
ok("a pagar: só aberta e vencida (3), total certo", v.to_pay.count === 3 && v.to_pay.total_cents === 11970, JSON.stringify(v.to_pay));
const seat = v.to_pay.charges.find((c) => c.kind === "extra_seat"), boost = v.to_pay.charges.find((c) => c.kind === "boost");
ok("desconto do Pix só quando ainda vale", seat.pix_discount_cents === 400 && seat.pix_discount_until != null && boost.pix_discount_cents === 0 && boost.pix_discount_until == null, JSON.stringify([seat.pix_discount_cents, seat.pix_discount_until, boost.pix_discount_cents, boost.pix_discount_until]));
ok("último dia do desconto ainda vale", v.to_pay.charges.find((c) => c.kind === "highlight").pix_discount_cents === 200);
ok("vencida marcada", boost.overdue === true && seat.overdue === false);
ok("casa sem nada a pagar: contagem zero", (await view(ADM, H2)).to_pay.count === 0);

// ---- paginação sem perder nem repetir (inclusive instantes iguais)
await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,created_at,updated_at) select $1,'boost','k','Empate '||g,100,current_date - (1000+g),current_date,'cancelada','idem-emp-'||g||'-abcdefg', timestamptz '2026-01-10 12:00:00+00', now() from generate_series(1,5) g`, [H1]);
const all = await view(ADM, H1, 200);
const walk = []; let before = null, pages = 0;
do { const p = await view(ADM, H1, 3, before); walk.push(...p.events); before = p.next_before; pages++; if (pages > 40) break; } while (before);
const key = (e) => `${e.kind}|${e.ref_id}|${e.at}`;
ok("andando de 3 em 3, junta exatamente os mesmos eventos (sem perder, sem repetir)", walk.length === all.events.length && new Set(walk.map(key)).size === walk.length && walk.map(key).sort().join() === all.events.map(key).sort().join(), `${walk.length}/${all.events.length} em ${pages} páginas`);
ok("instantes iguais ficam juntos na mesma página", pages > 1);
ok("última página: has_more falso e sem cursor", (await view(ADM, H1, 200)).has_more === false && (await view(ADM, H1, 200)).next_before === null);
ok("limite 0 vira 1 (nunca devolve vazio por engano)", (await view(ADM, H1, 0)).events.length >= 1);
ok("cursor antes de tudo: lista vazia, sem erro", (await view(ADM, H1, 10, "2000-01-01")).events.length === 0);

// ---- auditoria
const aud0 = await cnt0();
async function cnt0() { return (await sv("select count(*)::int n from admin_audit where key='ver_linha_do_tempo_da_casa'")).rows[0].n; }
await view(ADM, H1, 5); const aud1 = await cnt0();
await view(ADM, H1, 5, "2026-01-01"); const aud2 = await cnt0();
await tl(NOADM); const aud3 = await cnt0();
ok("abrir a primeira página registra (quem e qual casa); páginas seguintes e recusas não", aud1 === aud0 + 1 && aud2 === aud1 && aud3 === aud2, `${aud0},${aud1},${aud2},${aud3}`);
const lastAud = (await sv("select admin_id, new_value from admin_audit where key='ver_linha_do_tempo_da_casa' order by id desc limit 1")).rows[0];
ok("o registro guarda o administrador e a casa", lastAud.admin_id === ADM && lastAud.new_value.house_id === H1);

// ---- só leitura (fora a auditoria)
const snap = async () => (await sv(`select (select count(*) from platform_charges)::int a, (select count(*) from houses)::int b, (select count(*) from support_cases)::int c, (select count(*) from refund_requests)::int d, (select count(*) from messages)::int e, (select count(*) from house_plan_history)::int f, (select count(*) from reviews)::int g`)).rows[0];
const s1 = await snap(); await view(ADM, H1); await view(ADM, H2); const s2 = await snap();
ok("consultar não altera nada", JSON.stringify(s1) === JSON.stringify(s2));
const fn = await sv("select provolatile v, prosecdef d, proconfig c from pg_proc where proname='admin_house_timeline'");
ok("função security definer, search_path fixo", fn.rows[0].d === true && /search_path=public/.test(String(fn.rows[0].c)));
const acl = await sv(`select has_function_privilege('anon','public.admin_house_timeline(uuid,integer,timestamptz)','execute') a, has_function_privilege('public','public.admin_house_timeline(uuid,integer,timestamptz)','execute') p, has_function_privilege('authenticated','public.admin_house_timeline(uuid,integer,timestamptz)','execute') u`);
ok("ACL: só authenticated executa", !acl.rows[0].a && !acl.rows[0].p && acl.rows[0].u);
const inj = await tl(ADM, "00000000-0000-0000-0000-000000000000"); ok("id desconhecido não vaza detalhe técnico", /casa_inexistente/.test(inj.err ?? "") && !/relation|column|pg_/i.test(inj.err ?? ""));

// ---- volume
await force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,created_at,updated_at) select $1,'boost','k','Carga '||g,100,current_date - (5000+g),current_date,'cancelada','idem-vol-'||g||'-abcdefg', now() - (g || ' minutes')::interval, now() from generate_series(1,6000) g`, [H1]);
const t0 = Date.now(); const big = await view(ADM, H1, 60); const ms = Date.now() - t0;
ok("com milhares de eventos: devolve só a página e rápido", big.events.length >= 60 && big.events.length < 70 && big.has_more === true && ms < 1500, `${big.events.length} itens, ${ms} ms`);

ok("limite 9999 vira 200 (nunca devolve tudo)", (await view(ADM, H1, 9999)).events.length >= 200 && (await view(ADM, H1, 9999)).events.length < 215);
console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

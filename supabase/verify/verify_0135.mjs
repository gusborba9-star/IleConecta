// Verificação LOCAL da migration 0135 (reexecuta toda a bateria da 0130 contra a função nova + person_id) (central de pendências da casa).
// Uso: node supabase/verify/verify_0130.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0135";
const { c: su, failed } = await freshDb(name, { with64: true, max: 129 });
ok("migrations 0001–0129 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const MIGFILE = process.env.MIG_FILE ?? "0135_central_da_casa_pessoa_exata.sql";
const mig = readFileSync(new URL("../migrations/0130_central_de_pendencias_casa.sql", import.meta.url), "utf8") + "\n" + readFileSync(new URL(`../migrations/${MIGFILE}`, import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0130+0135 aplicam e reaplicam sem erro", e0 === null, e0 ?? "");
ok("não cria tabela nova (nenhuma cópia paralela)", (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n === tablesBefore);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err, "::", sql.slice(0, 140)); return r; };
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
const uuid = (p, i) => `${p}0130000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const T = (h) => `now() - interval '${h} hours'`;

// ---- pessoas e casas: H1 (Premium, com equipe), H2 (Grátis, com assistente), H3 (outra casa, para isolamento)
const O1 = uuid("a", 1), O2 = uuid("a", 2), O3 = uuid("a", 3), C1 = uuid("c", 1), C2 = uuid("c", 2), C3 = uuid("c", 3), C4 = uuid("c", 4), C5 = uuid("c", 5), S1 = uuid("e", 1), NOB = uuid("f", 1);
const H1 = uuid("d", 1), H2 = uuid("d", 2), H3 = uuid("d", 3);
for (const [id, t, nm] of [[O1, "casa", "Dona Um"], [O2, "casa", "Dona Dois"], [O3, "casa", "Dona Tres"], [C1, "cliente", "Ana"], [C2, "cliente", "Bia"], [C3, "cliente", "Caio"], [C4, "cliente", "Dora"], [C5, "cliente", "Edu"], [S1, "cliente", "Equipe"], [NOB, "cliente", "Sem Casa"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `${nm.replace(" ", "")}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=$2, display_name=$3", [id, t, nm]);
}
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','maximo'),($3,$4,'Casa Dois','casa-dois','gratis'),($5,$6,'Casa Tres','casa-tres','maximo')", [H1, O1, H2, O2, H3, O3]);
await su.query("insert into house_staff(house_id,user_id,name,active,perms) values ($1,$2,'Equipe',true,'{}')", [H1, S1]);
const setPerms = (p) => su.query("update house_staff set perms=$1 where house_id=$2", [p, H1]);

const central = (uid) => as(uid, (c) => q(c, "select public.house_pending_center() r"));
const view = async (uid) => { const r = await central(uid); if (r.err) throw new Error(r.err); return r.rows[0].r; };

// ---- acesso
const anon = await as(null, (c) => q(c, "select public.house_pending_center() r"), "anon");
const noHouse = await central(NOB);
const cli = await central(C1);
ok("visitante sem login não consulta", !!anon.err, anon.err);
ok("pessoa sem casa e sem equipe não consulta", !!noHouse.err && /not_house/.test(noHouse.err), noHouse.err);
ok("cliente comum não consulta", !!cli.err && /not_house/.test(cli.err), cli.err);
const hoursAnon = await as(null, (c) => q(c, "select public.house_pending_hours('conversa_sem_resposta') h"), "anon");
const hoursAuth = await as(O1, (c) => q(c, "select public.house_pending_hours('conversa_sem_resposta') h"));
ok("prazos padrão não são chamados direto por visitante nem usuário", !!hoursAnon.err && !!hoursAuth.err);
const empty = await view(O2);
ok("casa sem nada: central vazia", empty.total === 0 && empty.items.length === 0 && empty.role === "titular" && empty.house_name === "Casa Dois" && empty.to_pay.count === 0, JSON.stringify(empty).slice(0, 200));

// ---- conversas
const conv = async (owner, other) => { const id = (await su.query("insert into conversations default values returning id")).rows[0].id; await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)", [id, owner, other]); return id; };
const msg = (cid, sender, ago, extra = "") => force(`insert into messages(conversation_id,sender_id,text,created_at${extra ? "," + extra.split("|")[0] : ""}) values ($1,$2,'oi',${ago}${extra ? "," + extra.split("|")[1] : ""})`, [cid, sender]);
const CV_PEND = await conv(O1, C1); await msg(CV_PEND, C1, T(30));                                   // cliente falou, 30 h atrás: pendente e vencida
const CV_ANS = await conv(O1, C2); await msg(CV_ANS, C2, T(30)); await msg(CV_ANS, O1, T(29));       // casa respondeu
const CV_AST = await conv(O1, C3); await msg(CV_AST, C3, T(30)); await msg(CV_AST, O1, T(29), "from_assistant|true"); // assistente respondeu
const CV_QUIET = await conv(O1, C4); await msg(CV_QUIET, C4, "now() - interval '5 minutes'");        // acabou de chegar: ainda não conta
const CV_OLD = await conv(O1, C5); await msg(CV_OLD, C5, T(24 * 40));                                // há 40 dias: esquecida
const CV_DEL = await conv(O1, S1); await msg(CV_DEL, O1, T(50)); await msg(CV_DEL, S1, T(40)); await force("update messages set deleted_at=now() where conversation_id=$1 and sender_id=$2", [CV_DEL, S1]); // última foi apagada, a casa havia falado antes
const CV_HAND = await conv(O1, C2); await msg(CV_HAND, C2, T(5));                                    // com assunto pendente: aparece como assunto, não duplica
await force(`insert into conversation_handoff(conversation_id,house_owner_id,state,reason,since,updated_at) values ($1,$2,'pendente','Pedido de ajuda espiritual urgente', ${T(13)}, ${T(13)})`, [CV_HAND, O1]);
const CV_OTHER = await conv(O3, C1); await msg(CV_OTHER, C1, T(30));                                  // conversa de OUTRA casa
await su.query("insert into auth.users(id,email) values ($1,'blk@x.com')", [uuid("c", 9)]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente','Bloqueada') on conflict do nothing", [uuid("c", 9)]);
const CV_BLOCK = await conv(O1, uuid("c", 9));
await msg(CV_BLOCK, uuid("c", 9), T(30)); await force("insert into user_blocks(blocker_id,blocked_id) values ($1,$2)", [O1, uuid("c", 9)]);
let v = await view(O1);
const by = (k) => v.items.filter((i) => i.kind === k);
ok("conversa sem resposta: só a do cliente que falou por último", by("conversa_sem_resposta").length === 1 && by("conversa_sem_resposta")[0].ref_id === CV_PEND && by("conversa_sem_resposta")[0].title === "Conversa com Ana", JSON.stringify(by("conversa_sem_resposta")));
ok("conversa sem resposta vence em 24 h e está vencida", by("conversa_sem_resposta")[0].overdue === true);
ok("assunto da assistente aparece uma vez, sem duplicar como conversa", by("assunto_da_assistente").length === 1 && by("assunto_da_assistente")[0].ref_id === CV_HAND && by("assunto_da_assistente")[0].priority === "alta" && by("assunto_da_assistente")[0].overdue === true);

// ---- 0135: person_id (só titular, só conversas)
ok("0135: conversa traz o id da pessoa (a outra, não a dona)", by("conversa_sem_resposta")[0].person_id === C1, JSON.stringify(by("conversa_sem_resposta")[0]));
ok("0135: assunto da assistente traz a pessoa da conversa", by("assunto_da_assistente")[0].person_id !== undefined && by("assunto_da_assistente")[0].person_id !== O1 && by("assunto_da_assistente")[0].person_id !== null, JSON.stringify(by("assunto_da_assistente")[0]));
ok("0135: outros tipos não trazem person_id", v.items.filter((i) => !["conversa_sem_resposta", "assunto_da_assistente"].includes(i.kind)).every((i) => !("person_id" in i) || i.person_id === null));
ok("o conteúdo da mensagem nunca vai para a lista", !JSON.stringify(v).includes('"oi"'));

// ---- pedidos
const ord = (h, c, st, extra = "", vals = "") => force(`insert into service_orders(house_id,client_id,title,price_cents,status${extra}) values ($1,$2,'Trabalho de limpeza',5000,$3${vals}) returning id`, [h, c, st]);
await ord(H1, C1, "confirmado", ",updated_at", `,${T(60)}`);                                         // pago há 60 h: vencido
await ord(H1, C1, "confirmado", ",scheduled_at,ends_at", ",now() + interval '2 days',now() + interval '2 days 1 hour'");   // marcado para daqui a 2 dias: aparece
await ord(H1, C1, "confirmado", ",scheduled_at,ends_at", ",now() + interval '20 days',now() + interval '20 days 1 hour'"); // marcado para daqui a 20 dias: fora
await ord(H1, C1, "concluido"); await ord(H1, C1, "aguardando_pagamento");
await ord(H1, C1, "em_andamento", ",scheduled_at,ends_at", `,${T(4)},${T(3)}`);                      // passou do horário
await ord(H1, C1, "em_andamento", ",scheduled_at,ends_at", ",now() - interval '1 hour',now() + interval '3 hours'"); // ainda dentro
await ord(H3, C1, "confirmado", ",updated_at", `,${T(60)}`);                                         // OUTRA casa
v = await view(O1);
ok("pedidos: pago e vencido, e o marcado para a semana; o de 20 dias e os demais estados ficam fora", by("pedido_para_iniciar").length === 2, `${by("pedido_para_iniciar").length}`);
ok("atendimento em andamento que passou do horário aparece; o que está no horário não", by("atendimento_passou").length === 1);

// ---- membros / mensalidades
const mem = async (house, nm, left = null) => (await force(`insert into house_members(house_id,display_name,bond,monthly_cents,due_day,start_month,left_at) values ($1,$2,'filho',5000,5,(date_trunc('month', current_date) - interval '3 months')::date,${left ? "now()" : "null"}) returning id`, [house, nm])).rows?.[0]?.id;
const M1 = await mem(H1, "Membro Atrasado"), M2 = await mem(H1, "Membro Pago"), M3 = await mem(H1, "Membro Saiu", true), M4 = await mem(H3, "Membro De Outra Casa");
const due = (house, m, st, dueExpr, mo) => force(`insert into member_dues(member_id,house_id,month,amount_cents,due_date,status,paid_via,paid_at) values ($1,$2,(date_trunc('month', current_date) - ($3::int || ' months')::interval)::date,5000,${dueExpr},$4,${st === "paga" ? "'manual'" : "null"},${st === "paga" ? "now()" : "null"})`, [m, house, mo, st]);
await due(H1, M1, "aberta", "current_date - 5", 1); await due(H1, M1, "aberta", "current_date + 5", 0); await due(H1, M2, "paga", "current_date - 5", 2); await due(H1, M1, "dispensada", "current_date - 9", 3); await due(H1, M3, "aberta", "current_date - 5", 4); await due(H3, M4, "aberta", "current_date - 5", 1);
v = await view(O1);
ok("mensalidade: só a vencida e em aberto de quem ainda é membro", by("mensalidade_vencida").length === 1 && /Membro Atrasado — R\$ 50,00/.test(by("mensalidade_vencida")[0].title), JSON.stringify(by("mensalidade_vencida")));

// ---- reembolso, avaliação, moderação, suporte
const rf = async (st, resp) => {
  const o = (await ord(H1, C1, "reembolso_pendente")).rows[0].id;
  const pay = (await force(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',5000,'confirmado','v2-2026-10',500,now(),'pix') returning id`, [o])).rows[0].id;
  return force(`insert into refund_requests(payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status,created_at,house_responded_at) values ($1,$2,$3,$4,'antes_do_inicio','Não recebi o atendimento',5000,$5,${T(60)},${resp ? "now()" : "null"})`, [pay, o, H1, C1, st]);
};
await rf("pendente", false); await rf("pendente", true); await rf("recusado", false);
const rv = async (house, extra, vals) => { const o = (await ord(house, C1, "concluido")).rows[0].id; return force(`insert into reviews(house_id,author_id,rating,comment,service_order_id,created_at${extra}) values ($1,$2,5,'Ótimo',$3,${vals})`, [house, C1, o]); };
await rv(H1, "", T(24)); await rv(H1, ",reply", `${T(24)},'Obrigada'`); await rv(H1, ",hidden", `${T(24)},true`); await rv(H1, "", T(24 * 100)); await rv(H3, "", T(24));
const mf = (house, st, dl) => force(`insert into moderation_flags(house_id,target_table,target_id,reason,excerpt,status,created_at,deadline_at) values ($1,'services',gen_random_uuid(),'promessa','Cura garantida',$2,${T(10)},${dl})`, [house, st]);
await mf(H1, "orientada", "now() + interval '2 days'"); await mf(H1, "advertida", T(1)); await mf(H1, "pendente", "null"); await mf(H1, "encerrada", T(1)); await mf(H3, "orientada", "now() + interval '2 days'");
const sc = (house, st, by_, title) => force(`insert into support_cases(kind,priority,status,opened_by,house_id,title,description,first_response_due) values ('duvida','normal',$2,$3,$1,$4,'Descrição suficientemente longa do caso.',now() + interval '1 day') returning id`, [house, st, by_, title]);
await sc(H1, "aguardando_pessoa", O1, "Chamado aguardando a casa"); await sc(H1, "aberto", O1, "Chamado aberto"); await sc(H3, "aguardando_pessoa", O3, "Chamado de outra casa");
const SCI = (await sc(H1, "aguardando_envolvido", C1, "Chamado em que a casa é envolvida")).rows[0].id; await force("insert into support_case_parties(case_id,user_id,role) values ($1,$2,'envolvido')", [SCI, O1]);
v = await view(O1);
ok("dados de teste semeados por completo (sem erro de preparo)", (await cnt("select count(*)::int n from member_dues")) === 6 && (await cnt("select count(*)::int n from service_orders where house_id=$1", [H1])) >= 10 && (await cnt("select count(*)::int n from refund_requests")) === 3 && (await cnt("select count(*)::int n from reviews")) === 5 && (await cnt("select count(*)::int n from moderation_flags")) === 5 && (await cnt("select count(*)::int n from support_cases")) === 4);
ok("reembolso: só o pendente e sem resposta da casa", by("reembolso_da_casa").length === 1 && by("reembolso_da_casa")[0].title === "Reembolso de R$ 50,00" && by("reembolso_da_casa")[0].overdue === true);
ok("avaliação: só a recente, sem resposta e visível", by("avaliacao_sem_resposta").length === 1);
ok("moderação: orientada e advertida com prazo; pendente e encerrada ficam fora", by("moderacao").length === 2 && by("moderacao").some((i) => i.overdue));
ok("suporte: o que espera a casa (dela ou como envolvida); aberto e de outra casa ficam fora", by("suporte").length === 2 && !by("suporte").some((i) => /outra casa|aberto/i.test(i.title) && !/aguardando|envolvida/i.test(i.title)), by("suporte").map((i) => i.title).join(" | "));

// ---- cobrança
const ch = (house, i, st, dueExpr, extra = "", vals = "") => force(`insert into platform_charges(house_id,kind,item_key,description,amount_cents,period_start,due_date,status,idempotency_key,paid_at,paid_amount_cents${extra}) values ($1,'plan','plan:maximo','Plano Premium',29990,current_date - $2::int * 31,${dueExpr},$3,$4,${st === "paga" ? "now()" : "null"},${st === "paga" ? "29990" : "null"}${vals}) returning id`, [house, i, st, `idem-0130-${house.slice(0, 4)}-${i}`]);
await ch(H1, 1, "vencida", "current_date - 4"); await ch(H1, 2, "aberta", "current_date + 3", ",pix_discount_cents,pix_discount_until", ",1500,current_date + 2"); await ch(H1, 3, "aberta", "current_date + 20"); await ch(H1, 4, "paga", "current_date - 40"); await ch(H1, 5, "cancelada", "current_date - 50"); await ch(H3, 6, "vencida", "current_date - 4");
v = await view(O1);
ok("fatura: vencida e a que vence em até 7 dias; a de 20 dias só em 'a pagar'", by("fatura").length === 2 && by("fatura").some((i) => i.priority === "alta" && i.overdue) && by("fatura").every((i) => /R\$ 299,90/.test(i.title)), by("fatura").map((i) => i.title).join(" | "));
ok("a pagar: 3 faturas abertas, com total, vencimentos e valores", v.to_pay.count === 3 && v.to_pay.total_cents === 89970 && v.to_pay.charges.length === 3 && v.to_pay.charges[0].due_date <= v.to_pay.charges[1].due_date, JSON.stringify(v.to_pay).slice(0, 300));
ok("a pagar: desconto do Pix só enquanto vale", v.to_pay.charges.filter((c) => c.pix_discount_cents > 0).length === 1 && v.to_pay.charges.find((c) => c.pix_discount_cents > 0).pix_discount_cents === 1500);
ok("a pagar: marca o que está vencido", v.to_pay.charges.filter((c) => c.overdue).length === 1);

// ---- cadastro
await force("insert into house_payment_accounts(house_id,owner_id,stripe_account_id,charges_enabled,payouts_enabled,requirements_due,provider) values ($1,$2,'acct_x',false,false,true,'stripe')", [H1, O1]);
await force("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,brand,last4,exp_month,exp_year,auto_enabled) values ($1,'stripe','c','m','visa','4242',1,2020,true)", [H1]);
v = await view(O1);
ok("cadastro: CPF/CNPJ pendente para quem tem plano pago e não informou", by("cadastro_cpf_cnpj").length === 1);
ok("cadastro: conta de recebimento incompleta e cartão vencido", by("conta_de_recebimento").length === 1 && by("cartao_vencendo").length === 1 && /venceu/.test(by("cartao_vencendo")[0].title));
await force("update house_card_on_file set exp_year=2099, exp_month=12 where house_id=$1", [H1]);
ok("cartão com validade longe: nenhuma pendência", (await view(O1)).items.filter((i) => i.kind === "cartao_vencendo").length === 0);
await force("update house_card_on_file set exp_year=extract(year from current_date + 10)::int, exp_month=extract(month from current_date + 10)::int where house_id=$1", [H1]);
ok("cartão que vence nos próximos 30 dias: 'vence em breve'", (await view(O1)).items.filter((i) => i.kind === "cartao_vencendo" && /vence em breve/.test(i.title)).length === 1);
await force("update house_card_on_file set exp_year=2020, exp_month=1 where house_id=$1", [H1]);
await force("insert into house_tax_ids(house_id,kind,doc_enc,masked,set_by) values ($1,'cpf','\\x00','***.***.***-25',$2)", [H1, O1]);
ok("cadastro: some quando o CPF/CNPJ é informado", by("cadastro_cpf_cnpj").length === 0 || (await view(O1)).items.filter((i) => i.kind === "cadastro_cpf_cnpj").length === 0);

// ---- equipe: só o que a permissão libera, nunca pagamentos
await setPerms([]);
let s = await view(S1);
ok("equipe sem permissão: lista vazia, papel 'equipe', sem 'a pagar'", s.role === "equipe" && s.total === 0 && s.to_pay === null && s.house_name === "Casa Um", JSON.stringify(s).slice(0, 200));
await setPerms(["chat_read"]); s = await view(S1);
ok("equipe 'ver conversas': só conversas e assuntos", Object.keys(s.counts).sort().join() === "assunto_da_assistente,conversa_sem_resposta", JSON.stringify(s.counts));
await setPerms(["chat_reply"]); s = await view(S1);
ok("equipe 'responder' também enxerga conversas", s.counts.conversa_sem_resposta === 1);
ok("0135: equipe NUNCA recebe person_id", s.items.length > 0 && s.items.every((i) => !i.person_id), JSON.stringify(s.items.slice(0, 2)));
await setPerms(["orders"]); s = await view(S1);
ok("equipe 'ver pedidos': só pedidos (nada de reembolso nem fatura)", Object.keys(s.counts).sort().join() === "atendimento_passou,pedido_para_iniciar", JSON.stringify(s.counts));
await setPerms(["members"]); s = await view(S1);
ok("equipe 'membros' no Premium: só mensalidades", Object.keys(s.counts).join() === "mensalidade_vencida");
await setPerms(["calendar", "post", "stats"]); s = await view(S1);
ok("equipe com agenda, publicar e números: nenhuma pendência", s.total === 0);
await setPerms(["chat_read", "orders", "members", "calendar", "post", "stats"]); s = await view(S1);
ok("equipe com todas as permissões ainda não vê cobrança, reembolso, avaliação, moderação, suporte nem cadastro", !Object.keys(s.counts).some((k) => ["fatura", "reembolso_da_casa", "avaliacao_sem_resposta", "moderacao", "suporte", "cadastro_cpf_cnpj", "conta_de_recebimento", "cartao_vencendo", "assistente_sem_respostas"].includes(k)) && s.to_pay === null);
await su.query("update houses set plan='gratis' where id=$1", [H1]); const gs = await central(S1);
ok("casa fora do Premium: a equipe sem vaga deixa de consultar (regra de vagas que já existia)", !!gs.err && /not_house/.test(gs.err));
const o1g = await view(O1);
ok("casa fora do Premium: nem a titular vê mensalidades (a área de membros não existe nesse plano)", !("mensalidade_vencida" in o1g.counts));
await su.query("update houses set plan='maximo' where id=$1", [H1]);
await su.query("update house_staff set active=false where house_id=$1", [H1]); const dis = await central(S1);
ok("equipe desativada não consulta", !!dis.err && /not_house/.test(dis.err));
await su.query("update house_staff set active=true where house_id=$1", [H1]);

// ---- isolamento entre casas
const o3 = await view(O3);
ok("outra casa só vê o que é dela", o3.house_id === H3 && o3.items.every((i) => ![CV_PEND, CV_HAND].includes(i.ref_id)) && o3.counts.conversa_sem_resposta === 1 && o3.items.find((i) => i.kind === "conversa_sem_resposta").ref_id === CV_OTHER, JSON.stringify(o3.counts));
ok("a casa 3 vê as pendências próprias (pedido, mensalidade, moderação, suporte, fatura) e nenhuma da casa 1", ["pedido_para_iniciar", "mensalidade_vencida", "moderacao", "suporte", "fatura"].every((k) => o3.counts[k] === 1), JSON.stringify(o3.counts));
const ids1 = new Set((await view(O1)).items.map((i) => i.ref_id)); const ids3 = new Set(o3.items.map((i) => i.ref_id));
ok("nenhum item aparece nas duas casas", [...ids1].every((i) => !ids3.has(i)));
ok("'a pagar' de cada casa só tem as próprias faturas", (await view(O3)).to_pay.count === 1 && (await view(O1)).to_pay.charges.every((c) => c.id !== (o3.to_pay.charges[0]?.id)));

// ---- assistente: vale para o Grátis com pacote de créditos
await su.query("insert into assistants(house_id,enabled,display_name) values ($1,true,'Assistente')", [H2]);
let g = await view(O2);
ok("assistente ligada no Grátis e sem respostas: aparece como pendência alta", g.counts.assistente_sem_respostas === 1 && g.items.find((i) => i.kind === "assistente_sem_respostas").priority === "alta" && /sem respostas/.test(g.items.find((i) => i.kind === "assistente_sem_respostas").title), JSON.stringify(g.items));
await force("insert into ai_credit_packs(house_id,charge_id,size,remaining,purchased_at,expires_at) values ($1,gen_random_uuid(),80,5,now(),now() + interval '90 days')", [H2]);
g = await view(O2);
ok("com 5 créditos comprados: 'quase sem respostas' (prioridade normal, com a quantidade)", g.counts.assistente_sem_respostas === 1 && /quase sem respostas \(5\)/.test(g.items[0].title) && g.items[0].priority === "normal", JSON.stringify(g.items));
await force("update ai_credit_packs set remaining=80 where house_id=$1", [H2]);
g = await view(O2);
ok("com créditos de sobra, a assistente não vira pendência", !("assistente_sem_respostas" in g.counts));
await su.query("update assistants set enabled=false where house_id=$1", [H2]); await force("update ai_credit_packs set remaining=0 where house_id=$1", [H2]);
g = await view(O2);
ok("assistente desligada: nunca aparece", !("assistente_sem_respostas" in g.counts));
ok("Grátis sem CPF não gera pendência de cadastro (só plano pago)", !("cadastro_cpf_cnpj" in g.counts));

// ---- ordem, formato, só leitura
v = await view(O1);
const rank = (p) => (p === "alta" ? 0 : 1);
let sorted = true;
for (let i = 1; i < v.items.length; i++) { const a = v.items[i - 1], b = v.items[i]; if (a.overdue !== b.overdue) { if (!a.overdue) sorted = false; continue; } if (rank(a.priority) !== rank(b.priority)) { if (rank(a.priority) > rank(b.priority)) sorted = false; continue; } if (a.due_at && b.due_at && new Date(a.due_at) > new Date(b.due_at)) sorted = false; }
ok("ordem: vencidos antes, depois prioridade, depois prazo", sorted && v.items[0].overdue === true);
ok("cada item tem tipo, origem, prioridade válida e aba", v.items.every((i) => i.kind && i.ref_id && i.tab && ["alta", "normal"].includes(i.priority)));
ok("contagem de vencidos bate", v.overdue === v.items.filter((i) => i.overdue).length);
ok("valores em reais no formato brasileiro", v.items.filter((i) => /R\$/.test(i.title)).every((i) => /R\$ \d+,\d{2}/.test(i.title)));
const snap = async () => (await sv(`select (select count(*) from messages)::int a, (select count(*) from service_orders)::int b, (select count(*) from member_dues)::int c, (select count(*) from platform_charges)::int d, (select count(*) from refund_requests)::int e, (select count(*) from notifications)::int f, (select count(*) from admin_audit)::int g, (select count(*) from conversation_handoff)::int h`)).rows[0];
const s1 = await snap(); await view(O1); await view(S1); await view(O3); const s2 = await snap();
ok("consultar a central não altera nada", JSON.stringify(s1) === JSON.stringify(s2));
const fn = await sv("select provolatile v, prosecdef d, proconfig c from pg_proc where proname='house_pending_center'");
ok("função 'stable', security definer, search_path fixo", fn.rows[0].v === "s" && fn.rows[0].d === true && /search_path=public/.test(String(fn.rows[0].c)));
const acl = await sv(`select has_function_privilege('anon','public.house_pending_center()','execute') a, has_function_privilege('public','public.house_pending_center()','execute') p, has_function_privilege('authenticated','public.house_pending_hours(text)','execute') h`);
ok("ACL: anon e public sem execute; prazos só service_role", !acl.rows[0].a && !acl.rows[0].p && !acl.rows[0].h);

// ---- volume: 300 conversas sem resposta + limite de 200 itens
for (let i = 0; i < 220; i++) { const u = `b${String(i).padStart(7, "0")}-0000-0000-0000-000000000001`; await su.query("insert into auth.users(id,email) values ($1,$2)", [u, `v${i}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente',$2) on conflict do nothing", [u, `Cliente ${i}`]); const cid = await conv(O1, u); await msg(cid, u, T(2 + (i % 20))); }
const t0 = Date.now(); v = await view(O1); const ms = Date.now() - t0;
ok("limite de 200 itens com total real, vencidos continuam no topo", v.items.length === 200 && v.total > 200 && v.items[0].overdue === true, `${v.items.length}/${v.total}`);
ok("responde rápido com centenas de conversas", ms < 1500, `${ms} ms`);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

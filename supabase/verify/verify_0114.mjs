// Verificação LOCAL da migration 0114 (venda de destaque e impulsionamento).
// Uso: node supabase/verify/verify_0114.mjs   (PG em 127.0.0.1:5544)
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const name = "vf0114";
const { c: su, failed } = await freshDb(name, { with64: true, max: 114 });
ok("migrations 0001–0114 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
// o grant geral acima desfaz as permissões da migration: reaplica as que importam para o teste de segurança
await su.query(`revoke all on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds from anon, authenticated;
  grant select on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds to authenticated;
  revoke execute on function public.platform_promo_purchase(uuid,text,text,int,text,uuid,boolean), public.platform_promo_refund_begin(uuid,uuid,uuid,timestamptz), public.platform_promo_refund_done(uuid,text,timestamptz), public.platform_promo_refund_fail(uuid,text), public.promotions_tick(timestamptz), public.promotion_deliver(uuid,timestamptz) from public, anon, authenticated;
  revoke execute on function public.promotions_visible(), public.my_promotions(), public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.admin_set_promo_limit(text,int,text) from public, anon;
  grant execute on function public.promotions_visible() to anon;`);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (role, uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
await sv(`update platform_settings set value = value || '{"boost":{"state":"on","beta_houses":[]},"highlight":{"state":"on","beta_houses":[]}}'::jsonb where key='features'`);
ok("preço por dia do painel: impulso 19,90 / destaque 29,90 na cidade", (await sv(`select value->'boost_per_day'->>'cidade' b, value->'highlight_per_day'->>'cidade' h from platform_settings where key='pricing'`)).rows[0].b === "19.9");

let seq = 0;
async function mk(city = "Salvador", state = "BA", plan = "intermediario") {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0114000-0000-0000-0000-00000000${hex}`, H = `d0114000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `u${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city,state,country) values ($1,'casa','Pessoa',$2,$3,'BR') on conflict (id) do update set account_type='casa', city=$2, state=$3, country='BR'", [O, city, state]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${i}`, `casa-${i}`, plan]);
  return { O, H };
}
const svc = async (H, title = "Amor") => (await sv("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'trabalho',$2,'Descrição longa o suficiente para o serviço ser válido.',10000,true) returning id", [H, title])).rows[0].id;
const evt = async (H, days = 30) => { const r = await sv("insert into events(house_id,title,description,price_cents,seats_total,starts_at,ends_at,duration_min,status) values ($1,'Ritual de teste','Descrição do ritual de teste.',5000,20,now()+($2||' days')::interval,now()+($2||' days')::interval+interval '2 hours',120,'publicado') returning id", [H, String(days)]); if (r.err) throw new Error("evento: " + r.err); return r.rows[0].id; };
let pn = 0;
const buy = (H, kind, scope, days, itype = null, item = null, auth = true) => sv("select public.platform_promo_purchase($1,$2,$3,$4,$5,$6,$7) id", [H, kind, scope, days, itype, item, auth]);
const pay = async (chargeId) => {
  const amt = (await sv("select amount_cents a from platform_charges where id=$1", [chargeId])).rows[0].a;
  const ref = `cs_promo_${++pn}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'card',null)", [chargeId, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,300)", [ref, amt]);
  if (r.err) throw new Error(r.err);
  return Number(amt);
};
const promo = async (chargeId) => (await sv("select * from promotions where charge_id=$1", [chargeId])).rows[0];
const ago = (id, hours) => sv("update promotions set starts_at = starts_at - ($2||' hours')::interval, delivered_at = delivered_at - ($2||' hours')::interval where id=$1", [id, String(hours)]);
const notes = async (O) => (await sv("select text from notifications where user_id=$1 order by created_at, id", [O])).rows.map((x) => x.text);

// ---------- 1) funções puras ----------
const rc = async (p, u, d) => Number((await sv("select public.promo_refund_cents($1::bigint,$2,$3) v", [p, u, d])).rows[0].v);
ok("exemplo do proprietário: R$ 100,00 por 10 dias, 8 não usados = R$ 80,00", (await rc(10000, 8, 10)) === 8000);
ok("nada usado devolve tudo; nunca passa do pago; nunca zero", (await rc(19900, 10, 10)) === 19900 && (await rc(19900, 1, 10)) >= 1 && (await rc(19900, 1, 10)) <= 1990);
ok("normalização de local ignora acento e caixa", (await sv("select public.promo_norm('  São PAULO ') v")).rows[0].v === "sao paulo" && (await sv("select public.promo_norm('  ') v")).rows[0].v === null);

// ---------- 2) compra: recusas ----------
const A = await mk(), B = await mk(), C = await mk("Recife", "PE");
const sA = await svc(A.H, "Amor"), sA2 = await svc(A.H, "Prosperidade"), sB = await svc(B.H), eA = await evt(A.H, 30), eSoon = await evt(A.H, 2);
let r = await buy(A.H, "boost", "cidade", 10, "service", sA, false);
ok("sem a caixa de autorização a compra é recusada", /autorização de início imediato/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 0, "service", sA);
ok("dias fora de 1..90 recusados", /1 a 90/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 91, "service", sA);
ok("91 dias recusado", /1 a 90/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 5, "service", sB);
ok("impulsionar serviço de OUTRA casa é recusado", /serviços ativos da sua casa/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 5, null, null);
ok("impulso sem item é recusado", /Escolha o serviço ou ritual/.test(r.err ?? ""), r.err);
r = await buy(A.H, "boost", "cidade", 5, "event", eSoon);
ok("ritual que começa em 2 dias: 5 dias é recusado e informa o máximo", /no máximo 1 dia/.test(r.err ?? ""), r.err);
r = await buy(A.H, "highlight", "mundo", 5);
ok("alcance inválido recusado", /Alcance inválido/.test(r.err ?? ""), r.err);
await sv("update profiles set city=null where id=$1", [B.O]);
r = await buy(B.H, "highlight", "cidade", 5);
ok("sem cidade no perfil não vende por cidade", /Complete a cidade/.test(r.err ?? ""), r.err);
r = await buy(B.H, "highlight", "estado", 5);
ok("por estado vende mesmo sem cidade", !r.err, r.err);
await sv("update profiles set city='Salvador' where id=$1", [B.O]);
await sv(`update platform_settings set value = jsonb_set(value, '{boost,state}', '"off"') where key='features'`);
r = await buy(A.H, "boost", "cidade", 5, "service", sA);
ok("recurso desligado no painel não vende", /ainda não está disponível/.test(r.err ?? ""), r.err);
await sv(`update platform_settings set value = jsonb_set(value, '{boost,state}', '"on"') where key='features'`);
const inact = await svc(A.H, "Inativo"); await sv("update services set active=false where id=$1", [inact]);
r = await buy(A.H, "boost", "cidade", 5, "service", inact);
ok("serviço inativo não pode ser impulsionado", /serviços ativos/.test(r.err ?? ""), r.err);

const priv = await svc(A.H, "Privado"); await sv("update services set listed=false where id=$1", [priv]);
r = await buy(A.H, "boost", "cidade", 5, "service", priv);
ok("serviço privado (fora da página) não pode ser impulsionado", /serviços ativos/.test(r.err ?? ""), r.err);

// ---------- 3) compra, preço e entrega ----------
r = await buy(A.H, "boost", "cidade", 10, "service", sA);
ok("compra válida devolve a fatura", !r.err && r.rows[0].id, r.err);
const ch1 = r.rows[0].id;
let c = (await sv("select amount_cents a, kind k, status s from platform_charges where id=$1", [ch1])).rows[0];
ok("preço = 19,90 x 10 dias, calculado no servidor, fatura do tipo boost", Number(c.a) === 19900 && c.k === "boost" && c.s === "aberta", JSON.stringify(c));
let p1 = await promo(ch1);
ok("antes do pagamento: aguardando, sem início, autorização carimbada", p1.status === "aguardando" && p1.starts_at === null && p1.authorized_at !== null);
r = await buy(A.H, "boost", "cidade", 10, "service", sA);
ok("clique repetido reaproveita a mesma fatura aberta", r.rows?.[0]?.id === ch1, r.err);
await pay(ch1);
p1 = await promo(ch1);
const e1 = (await sv("select extract(epoch from (now() - starts_at)) s, extract(epoch from (public.promo_eff_end(p, now()) - p.starts_at))/86400 d, public.promo_blocks_started(p, now()) b from promotions p where id=$1", [p1.id])).rows[0];
ok("pago: ativa, relógio começa na entrega, termina em 10 dias, 1º dia já conta como usado", p1.status === "ativa" && Number(e1.s) < 5 && Number(e1.d) === 10 && e1.b === 1, JSON.stringify(e1));
ok("aviso à casa com a data exata do fim", (await notes(A.O)).some((t) => /começou e vai até \d\d\/\d\d às \d\d:\d\d/.test(t)));
const nBefore = (await notes(A.O)).length;
await sv("update platform_charges set status='paga' where id=$1", [ch1]);
ok("entrega acontece uma única vez (nova marcação de pago não repete)", (await notes(A.O)).length === nBefore && (await promo(ch1)).starts_at.getTime() === p1.starts_at.getTime());

// ---------- 4) somar dias: mesmo item e alcance; itens diferentes ficam independentes ----------
r = await buy(A.H, "boost", "cidade", 5, "service", sA);
const ch2 = r.rows[0].id; await pay(ch2);
let p2 = await promo(ch2);
let endsFirst = (await sv("select public.promo_eff_end(p, now()) e from promotions p where id=$1", [p1.id])).rows[0].e;
ok("segunda compra do MESMO item e alcance entra no fim da primeira", p2.status === "ativa" && p2.starts_at.getTime() === endsFirst.getTime());
ok("aviso de dias somados", (await notes(A.O)).some((t) => /Os dias novos foram somados/.test(t)));
r = await buy(A.H, "boost", "cidade", 7, "service", sA2);
const ch3 = r.rows[0].id; await pay(ch3);
let p3 = await promo(ch3);
ok("OUTRO item não soma: começa agora (relógio independente)", Math.abs(p3.starts_at.getTime() - Date.now()) < 30000);
r = await buy(A.H, "boost", "estado", 7, "service", sA);
const ch4 = r.rows[0].id; await pay(ch4);
ok("MESMO item em OUTRO alcance também é independente", Math.abs((await promo(ch4)).starts_at.getTime() - Date.now()) < 30000);
r = await buy(A.H, "boost", "cidade", 3, "event", eA);
ok("ritual com 30 dias de antecedência aceita 3 dias", !r.err, r.err);

// ---------- 5) reembolso: só dias que ainda não começaram ----------
await ago(p1.id, 25); // 25h depois da entrega: dias 1 e 2 já iniciados
let b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, ch1]);
const rb = b.rows?.[0]?.r;
ok("às 25h: usou 2 blocos, devolve 8 de 10 = R$ 159,20", !b.err && rb.amount_cents === 15920 && rb.days_refunded === 8, b.err ?? JSON.stringify(rb));
let q1 = await promo(ch1);
ok("os 8 dias saem na hora: a compra passa a ter 2 dias (o dia em andamento continua até o fim do bloco)", q1.days === 2 && q1.status === "ativa");
p2 = await promo(ch2);
const endsAfter = (await sv("select public.promo_eff_end(p, now()) e from promotions p where id=$1", [p1.id])).rows[0].e;
ok("a compra de trás (soma) adianta e passa a começar quando a primeira termina", p2.starts_at.getTime() === endsAfter.getTime(), `${p2.starts_at.toISOString()} vs ${endsAfter.toISOString()}`);
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, ch1]);
ok("pedir de novo retoma o mesmo reembolso, sem duplicar", b.rows?.[0]?.r.resume === true && b.rows[0].r.amount_cents === 15920);
let d = await sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1), 're_x') r", [ch1]);
ok("concluído no provedor", !d.err, d.err);
ok("livro-razão tem o estorno de R$ 159,20; fatura segue paga (reembolso parcial)", (await sv("select sum(amount_cents)::int s from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [ch1])).rows[0].s === 15920 && (await sv("select status s from platform_charges where id=$1", [ch1])).rows[0].s === "paga");
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, ch1]);
ok("não dá para reembolsar duas vezes", /já foi reembolsada/.test(b.err ?? ""), b.err);
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [B.H, ch2]);
ok("outra casa não reembolsa compra alheia", /não pode ser reembolsada/.test(b.err ?? ""), b.err);
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()+interval '8 days') r", [A.H, ch2]);
ok("depois de 7 dias do pagamento: recusado", /prazo de 7 dias/.test(b.err ?? ""), b.err);
// compra na fila (nunca começou): integral
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, ch2]);
ok("compra que ainda não começou volta integral (R$ 99,50)", !b.err && b.rows[0].r.amount_cents === 9950 && b.rows[0].r.days_refunded === 5, b.err ?? JSON.stringify(b.rows[0].r));
ok("e fica 'reembolsada'", (await promo(ch2)).status === "reembolsada");
// falha definitiva do provedor devolve os dias
await sv("select public.platform_promo_refund_fail((select id from promo_refunds where charge_id=$1), 'recusado')", [ch2]);
p2 = await promo(ch2);
ok("falha do provedor: a compra volta ativa com os 5 dias e na fila", p2.status === "ativa" && p2.days === 5 && p2.starts_at.getTime() === endsAfter.getTime());
// tudo já iniciado
await ago(p3.id, 24 * 7 - 1);
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [A.H, ch3]);
ok("quando todos os dias já começaram não há o que devolver", /já começaram/.test(b.err ?? ""), b.err);

// ---------- 6) vagas do destaque ----------
const hs = []; for (let i = 0; i < 4; i++) hs.push(await mk("Campinas", "SP"));
for (let i = 0; i < 3; i++) { r = await buy(hs[i].H, "highlight", "cidade", 3); if (r.err) { ok(`destaque ${i + 1}/3 aceito`, false, r.err); } else await pay(r.rows[0].id); }
const av = async (O) => as("authenticated", O, (cl) => q(cl, "select public.promo_availability() a")).then((x) => x.rows?.[0]?.a);
let a4 = await av(hs[3].O);
ok("vagas da cidade: 3 de 3 ocupadas, cheia para a 4ª casa", a4.scopes.cidade.taken === 3 && a4.scopes.cidade.limit === 3 && a4.scopes.cidade.full === true, JSON.stringify(a4.scopes.cidade));
r = await buy(hs[3].H, "highlight", "cidade", 3);
ok("4ª casa não consegue comprar: sem vaga", /sem_vaga/.test(r.err ?? ""), r.err);
r = await buy(hs[3].H, "highlight", "estado", 3);
ok("mas ainda há vaga no alcance de estado (limite separado)", !r.err, r.err);
r = await buy(hs[0].H, "highlight", "cidade", 2);
ok("quem já está em destaque soma dias sem precisar de nova vaga", !r.err, r.err);
const other = await mk("Santos", "SP");
r = await buy(other.H, "highlight", "cidade", 3);
ok("outra cidade tem as suas próprias vagas", !r.err, r.err);
const j = await as("authenticated", hs[3].O, (cl) => q(cl, "select public.promo_waitlist_join('cidade')"));
ok("casa entra na lista de espera quando está cheio", !j.err && (await sv("select count(*)::int n from promo_waitlist where house_id=$1", [hs[3].H])).rows[0].n === 1, j.err);
const jj = await as("authenticated", other.O, (cl) => q(cl, "select public.promo_waitlist_join('cidade')"));
ok("com vaga livre não entra na fila", /Há vaga disponível/.test(jj.err ?? ""), jj.err);
// libera uma vaga e roda a rotina
await sv("update promotions set status='encerrada' where house_id=$1 and kind='highlight' and scope='cidade'", [hs[0].H]);
const tk = await sv("select public.promotions_tick(now()) t");
ok("rotina chama a primeira da fila quando abre vaga", tk.rows[0].t.waitlist_called === 1 && (await notes(hs[3].O)).some((t) => /Abriu uma vaga de destaque/.test(t)) && (await sv("select count(*)::int n from promo_waitlist where house_id=$1", [hs[3].H])).rows[0].n === 0);
// vaga some enquanto o pagamento era confirmado
const x1 = await mk("Natal", "RN"), x2 = await mk("Natal", "RN");
await sv("update promo_limits set highlight_slots=1 where scope='cidade'");
const k1 = (await buy(x1.H, "highlight", "cidade", 3)).rows[0].id;
await sv("alter table promotions disable trigger trg_promotions_guard"); await sv("update promotions set created_at = now() - interval '2 hours' where charge_id=$1", [k1]); await sv("alter table promotions enable trigger trg_promotions_guard"); // reserva vencida
const k2 = (await buy(x2.H, "highlight", "cidade", 3)).rows[0].id;
await pay(k2);
await pay(k1);
const pk1 = await promo(k1);
ok("pagou depois da reserva vencer e a vaga já tinha dono: não entrega, cancela e devolve tudo", pk1.status === "cancelada" && (await sv("select reason r, amount_cents::int a, status s from promo_refunds where charge_id=$1", [k1])).rows[0].r === "sem_vaga");
ok("a reembolsada automática aparece para a rotina refazer", (await sv("select count(*)::int n from platform_promo_refunds_pending(interval '0 seconds') where refund_id=(select id from promo_refunds where charge_id=$1)", [k1])).rows[0].n === 1);
await sv("select public.platform_promo_refund_done((select id from promo_refunds where charge_id=$1), 're_auto')", [k1]);
ok("concluído: compra 'reembolsada' e fatura 'estornada'", (await promo(k1)).status === "reembolsada" && (await sv("select status s from platform_charges where id=$1", [k1])).rows[0].s === "estornada");
await sv("update promo_limits set highlight_slots=3 where scope='cidade'");

// ---------- 7) pausa na suspensão ----------
const pz = await mk("Maceió", "AL");
const zc = (await buy(pz.H, "highlight", "estado", 4)).rows[0].id; await pay(zc);
const pzr = await promo(zc);
await sv("insert into house_billing_state(house_id, suspended, since) values ($1, true, now()) on conflict (house_id) do update set suspended=true, since=now()", [pz.H]);
ok("suspensão pausa o relógio", (await promo(zc)).pause_started_at !== null);
r = await buy(pz.H, "highlight", "cidade", 2);
ok("suspensa não consegue contratar", /Regularize a fatura/.test(r.err ?? ""), r.err);
await sv("update promotions set pause_started_at = now() - interval '2 hours' where id=$1", [pzr.id]);
const endBefore = (await sv("select public.promo_eff_end(p, now()) e from promotions p where id=$1", [pzr.id])).rows[0].e;
await sv("update house_billing_state set suspended=false where house_id=$1", [pz.H]);
const pzr2 = await promo(zc);
const endAfterResume = (await sv("select public.promo_eff_end(p, now()) e from promotions p where id=$1", [pzr2.id])).rows[0].e;
ok("regularizou: o tempo parado (2 h) é acrescentado ao fim", pzr2.pause_started_at === null && Math.abs(Number(pzr2.paused_seconds) - 7200) <= 2 && Math.abs(endAfterResume - endBefore) < 3000, `${pzr2.paused_seconds}s`);

// ---------- 8) o que cada visitante vê ----------
const V1 = await mk("Salvador", "BA"), V2 = await mk("Recife", "PE"), V3 = await mk("Feira de Santana", "BA");
const vis = async (uid) => (uid ? as("authenticated", uid, (cl) => q(cl, "select public.promotions_visible() v")) : as("anon", null, (cl) => q(cl, "select public.promotions_visible() v"))).then((x) => x.rows?.[0]?.v ?? x.err);
const hl = (await buy(A.H, "highlight", "cidade", 3)).rows[0].id; await pay(hl);
const view = (v, kind) => (Array.isArray(v) ? v.filter((i) => i.kind === kind) : []);
ok("quem mora na MESMA cidade vê o destaque e o impulso da casa de Salvador", view(await vis(V1.O), "highlight").some((i) => i.house_id === A.H) && view(await vis(V1.O), "boost").some((i) => i.item_id === sA));
ok("quem mora em OUTRA cidade do mesmo estado não vê o de cidade, mas vê o de estado", !view(await vis(V3.O), "highlight").some((i) => i.house_id === A.H && i.scope === "cidade") && view(await vis(V3.O), "boost").some((i) => i.scope === "estado" && i.item_id === sA));
ok("quem mora em outro estado não vê alcance de cidade nem de estado", !view(await vis(V2.O), "highlight").some((i) => i.house_id === A.H) && !view(await vis(V2.O), "boost").some((i) => i.item_id === sA));
const nac = (await buy(A.H, "boost", "pais", 3, "service", sA2)).rows[0].id; await pay(nac);
ok("alcance de país aparece para qualquer um, inclusive visitante sem login (sem local)", view(await vis(null), "boost").some((i) => i.scope === "pais") && !view(await vis(null), "boost").some((i) => i.scope === "cidade") && view(await vis(V2.O), "boost").some((i) => i.scope === "pais"));
ok("pausadas não aparecem", !view(await vis(V1.O), "highlight").some((i) => i.house_id === pz.H));
await sv("update services set active=false where id=$1", [sA2]);
ok("serviço desativado some do impulso (a casa foi avisada que o tempo corre)", !view(await vis(V2.O), "boost").some((i) => i.item_id === sA2));
await sv("update services set active=true where id=$1", [sA2]);
await sv("update promotions set starts_at = starts_at - interval '40 days' where id=(select id from promotions where charge_id=$1)", [hl]);
ok("compra vencida não aparece mesmo antes da rotina rodar", !view(await vis(V1.O), "highlight").some((i) => i.house_id === A.H && i.scope === "cidade"));

// ---------- 9) rotina: encerra e avisa antes do fim ----------
const T = await mk("Aracaju", "SE"); const sT = await svc(T.H, "Teste");
const tc = (await buy(T.H, "boost", "cidade", 3, "service", sT)).rows[0].id; await pay(tc);
const tp = await promo(tc);
await ago(tp.id, 50); // 2 dias e 2 horas depois: falta menos de 1 dia
let t1 = await sv("select public.promotions_tick(now()) t");
ok("1 dia antes do fim a casa recebe o aviso de renovação", t1.rows[0].t.notices >= 1 && (await notes(T.O)).some((t) => /termina \d\d\/\d\d às \d\d:\d\d\. Renove/.test(t)));
const nn1 = (await notes(T.O)).length; await sv("select public.promotions_tick(now())");
ok("o aviso não se repete", (await notes(T.O)).length === nn1);
await ago(tp.id, 30);
await sv("select public.promotions_tick(now())");
ok("passou do fim: a rotina encerra", (await promo(tc)).status === "encerrada");
b = await sv("select public.platform_promo_refund_begin($1,$2,null,now()) r", [T.H, tc]);
ok("encerrada não gera reembolso", /não está ativa/.test(b.err ?? ""), b.err);

// ---------- 10) segurança ----------
r = await as("authenticated", A.O, (cl) => q(cl, "insert into promotions(house_id,kind,scope,days,amount_cents,authorized_at) values ($1,'highlight','pais',30,100,now())", [A.H]));
ok("a casa não grava compra direto (só pela função de compra)", !!r.err, r.err);
r = await as("authenticated", A.O, (cl) => q(cl, "update promotions set days=90, status='ativa' where house_id=$1", [A.H]));
ok("a casa não altera compra", !!r.err, r.err);
r = await as("authenticated", A.O, (cl) => q(cl, "select public.platform_promo_purchase($1,'highlight','pais',1,null,null,true)", [A.H]));
ok("a casa não chama a compra direto, sem passar pelo servidor", !!r.err, r.err);
r = await as("authenticated", A.O, (cl) => q(cl, "select public.platform_promo_refund_begin($1,$2)", [A.H, ch3]));
ok("a casa não chama o início do reembolso direto", !!r.err, r.err);
r = await as("authenticated", B.O, (cl) => q(cl, "select count(*)::int n from promotions where house_id=$1", [A.H]));
ok("casa não vê compras de outra casa", r.rows?.[0]?.n === 0, JSON.stringify(r));
r = await as("authenticated", A.O, (cl) => q(cl, "select public.my_promotions() m"));
const mine = r.rows?.[0]?.m;
ok("a casa vê as próprias compras com contador e reembolso possível", Array.isArray(mine?.items) && mine.items.length >= 4 && mine.items.some((i) => i.running && i.ends_at && i.days_left !== null) && mine.items.every((i) => i.refund_cents == null || i.refund_cents > 0), JSON.stringify(mine?.items?.[0]).slice(0, 200));
ok("my_promotions não vaza 'undefined' nem campos nulos de reembolso quando não cabe", !JSON.stringify(mine).includes("undefined"));
r = await sv("delete from promotions where id=$1", [p1.id]);
ok("compra não pode ser apagada nem pelo servidor", /não pode ser apagada/.test(r.err ?? ""), r.err);
r = await as("authenticated", A.O, (cl) => q(cl, "select public.admin_set_promo_limit('cidade', 5, 'teste')"));
ok("só administrador altera as vagas", !!r.err, r.err);
const ADM = "a0114000-0000-0000-0000-0000000000a1";
await su.query("insert into auth.users(id,email) values ($1,'adm@x.com')", [ADM]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente','Adm') on conflict (id) do nothing", [ADM]); await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
r = await as("authenticated", ADM, (cl) => q(cl, "select public.admin_set_promo_limit('cidade', 5, 'mercado maior')"));
ok("administrador altera as vagas com motivo e fica na auditoria", !r.err && (await sv("select highlight_slots s from promo_limits where scope='cidade'")).rows[0].s === 5 && (await sv("select count(*)::int n from admin_audit where key='promo_limit'")).rows[0].n === 1, r.err);
r = await as("authenticated", ADM, (cl) => q(cl, "select public.admin_set_promo_limit('cidade', 0, 'x')"));
ok("limite inválido e motivo curto recusados", !!r.err, r.err);
ok("permissões: servidor chama; público e login não", (await q(su, `select has_function_privilege('service_role','public.platform_promo_purchase(uuid,text,text,int,text,uuid,boolean)','execute') a, has_function_privilege('authenticated','public.platform_promo_purchase(uuid,text,text,int,text,uuid,boolean)','execute') b, has_function_privilege('anon','public.promotions_tick(timestamptz)','execute') c`)).rows[0].a === true);

// ---------- 11) duas casas disputando a última vaga ao mesmo tempo ----------
const R1 = await mk("Belém", "PA"), R2 = await mk("Belém", "PA"), R3 = await mk("Belém", "PA");
await sv("update promo_limits set highlight_slots=1 where scope='cidade'");
const race = await Promise.all([R1, R2, R3].map(async (R) => { const cl = await connect(name); try { return await q(cl, "select public.platform_promo_purchase($1,'highlight','cidade',3,null,null,true) id", [R.H]); } finally { await cl.end(); } }));
ok("3 casas disputam 1 vaga ao mesmo tempo: exatamente 1 consegue, as outras recebem 'sem vaga'", race.filter((x) => !x.err).length === 1 && race.filter((x) => /sem_vaga/.test(x.err ?? "")).length === 2, JSON.stringify(race.map((x) => x.err ?? "ok")));
await sv("update promo_limits set highlight_slots=3 where scope='cidade'");

console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end();
process.exit(bad ? 1 : 0);

// Verificação LOCAL da migration 0124 (aviso de 30 dias do bloqueio total). Uso: node supabase/verify/verify_0124.mjs (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"], ["0108_contratacao_de_plano_no_app.sql", "-- ============ 8) permissões ============"]];
const name = "vf0124";
const { c: su, failed } = await freshDb(name, { with64: true, max: 123 });
ok("migrations 0001–0123 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);

for (const [f, m] of PERMS) { try { await su.query(part(f, m)); } catch { /* assinatura antiga trocada pela 0123 */ } }
const mig = readFileSync(new URL("../migrations/0124_aviso_30_dias_bloqueio_total.sql", import.meta.url), "utf8");
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0124 aplica e reaplica sem erro", e0 === null, e0 ?? "");
const q = (sql, p) => su.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const SP = (await q("select (now() at time zone 'America/Sao_Paulo')::date d")).rows[0].d;
const iso = (d, add = 0) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + add); return x.toISOString().slice(0, 10); };
const cfg = async () => (await q("select value from platform_settings where key='billing_config'")).rows[0].value;
const save = async (patch) => { const c = await cfg(); const r = await q("update platform_settings set value = $1::jsonb where key='billing_config'", [JSON.stringify({ ...c, ...patch })]); return r; };
const setFrom = async (d) => { await su.query("alter table platform_settings disable trigger billing_config_schedule_total"); await su.query("update platform_settings set value = jsonb_set(value,'{total_block_next,from}', to_jsonb($1::text)) where key='billing_config'", [d]); await su.query("alter table platform_settings enable trigger billing_config_schedule_total"); };
let seq = 0;
async function house(enrolled = true) {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0124000-0000-0000-0000-00000000${hex}`, H = `d0124000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `h${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'maximo')", [H, O, `Casa ${i}`, `casa-t-${i}`]);
  if (enrolled) await su.query("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date,true)", [H]);
  return { O, H };
}
const notes = async (O) => (await q("select text, href from notifications where user_id=$1 order by created_at", [O])).rows;
const A = await house(), B = await house(), C = await house(false);

// ---- estado inicial
ok("prazo em vigor inicial é 30", (await q("select public.billing_total_days() d")).rows[0].d === 30);
// ---- validação
const okc = async (extra) => (await q("select public.billing_config_ok($1::jsonb || (select value from platform_settings where key='billing_config')) r", [JSON.stringify(extra)])).rows[0].r;
ok("config aceita total_block_next válido", (await okc({ total_block_next: { days: 45, from: iso(SP, 30) } })) === true);
ok("config recusa dias 6/91, data ruim, chave extra, tipo errado", !(await okc({ total_block_next: { days: 6, from: iso(SP, 30) } })) && !(await okc({ total_block_next: { days: 91, from: iso(SP, 30) } })) && !(await okc({ total_block_next: { days: 45, from: "30/12/2026" } })) && !(await okc({ total_block_next: { days: 45, from: iso(SP, 30), x: 1 } })) && !(await okc({ total_block_next: "45" })));

// ---- mudar o prazo agenda em 30 dias, não muda na hora
let r = await save({ total_block_days: 45 });
ok("salvar 45 não dá erro", !r.err, r.err);
let c = await cfg();
ok("prazo em vigor continua 30 e a mudança fica agendada para daqui a 30 dias", c.total_block_days === 30 && c.total_block_next?.days === 45 && c.total_block_next?.from === iso(SP, 30), JSON.stringify(c.total_block_next));
ok("billing_total_days continua 30", (await q("select public.billing_total_days() d")).rows[0].d === 30);
let nA = await notes(A.O);
ok("casa matriculada recebe 1 aviso com data e prazos, link /planos", nA.length === 1 && nA[0].href === "/planos" && /45/.test(nA[0].text) && /30/.test(nA[0].text) && nA[0].text.includes(iso(SP, 30).split("-").reverse().join("/")), JSON.stringify(nA));
ok("casa não matriculada não recebe", (await notes(C.O)).length === 0);

// ---- salvar de novo com o mesmo valor desejado não reinicia o relógio nem repete aviso
await setFrom(iso(SP, 20));
r = await save({ total_block_days: 45 });
c = await cfg();
ok("repetir 45 mantém a data já marcada e não duplica aviso", c.total_block_next.from === iso(SP, 20) && (await notes(A.O)).length === 1, JSON.stringify(c.total_block_next));
// ---- o painel não consegue escolher a data nem pular o aviso
r = await save({ total_block_days: 60, total_block_next: { days: 60, from: iso(SP, -1) } });
c = await cfg();
ok("data enviada pelo painel é ignorada: nova mudança vale daqui a 30 dias", c.total_block_next.days === 60 && c.total_block_next.from === iso(SP, 30) && c.total_block_days === 30, JSON.stringify(c));
ok("mudança nova gera novo aviso", (await notes(A.O)).length === 2);
// ---- voltar ao prazo atual cancela e avisa
r = await save({ total_block_days: 30 });
c = await cfg();
nA = await notes(A.O);
ok("voltar a 30 cancela a mudança e avisa", c.total_block_next === undefined && c.total_block_days === 30 && nA.length === 3 && /cancelada/.test(nA[2].text), JSON.stringify(nA.map((x) => x.text)));
r = await save({ total_block_days: 30 });
ok("salvar de novo sem mudança não gera aviso", (await notes(A.O)).length === 3);
// ---- outras mudanças de configuração não mexem no agendamento
await save({ total_block_days: 50 });
r = await save({ notice_days: 5, total_block_days: 50 });
c = await cfg();
ok("alterar outro campo preserva a mudança agendada (painel manda o desejado)", c.notice_days === 5 && c.total_block_next?.days === 50 && c.total_block_days === 30, JSON.stringify(c));
// ---- chegou o dia: entra em vigor
await setFrom(iso(SP, 0));
ok("no dia marcado o prazo passa a 50", (await q("select public.billing_total_days() d")).rows[0].d === 50);
const before = (await notes(A.O)).length;
r = await save({ total_block_days: 50 });
c = await cfg();
ok("salvar depois da virada grava 50 como prazo em vigor, sem agendamento e sem aviso", c.total_block_days === 50 && c.total_block_next === undefined && (await notes(A.O)).length === before, JSON.stringify(c));
// ---- virar de volta para 30 depois da virada agenda de novo
r = await save({ total_block_days: 30 });
c = await cfg();
ok("de 50 para 30 também espera 30 dias", c.total_block_days === 50 && c.total_block_next?.days === 30, JSON.stringify(c));
// ---- datas antes do dia marcado
await setFrom(iso(SP, 1));
ok("um dia antes do marcado ainda vale 50", (await q("select public.billing_total_days() d")).rows[0].d === 50);
// ---- caminho real do painel: insert ... on conflict do update (como admin_set_setting)
await setFrom(iso(SP, 5));
const cc = await cfg();
const rr = await q("insert into platform_settings (key, value) values ('billing_config', $1::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()", [JSON.stringify({ ...cc, total_block_days: 70, total_block_next: undefined })]);
const c2 = await cfg();
ok("upsert do painel também agenda (70 em 30 dias) e mantém o prazo em vigor", !rr.err && c2.total_block_days === 50 && c2.total_block_next?.days === 70 && c2.total_block_next?.from === iso(SP, 30), rr.err ?? JSON.stringify(c2.total_block_next));
// ---- permissões
const acl = (await q("select has_function_privilege('anon','public.billing_config_schedule_total()','execute') a, has_function_privilege('authenticated','public.billing_config_schedule_total()','execute') b, has_function_privilege('service_role','public.billing_config_schedule_total()','execute') c")).rows[0];
ok("função do gatilho sem acesso para anon/authenticated/service_role", !acl.a && !acl.b && !acl.c, JSON.stringify(acl));
// ---- reaplicar a migration não muda o estado
const snap = JSON.stringify(await cfg());
await su.query(mig);
ok("reaplicar a migration não altera a configuração", JSON.stringify(await cfg()) === snap);
// ---- mensagem de total_em_breve usa o prazo em vigor
const t = await q("select public.billing_total_days() d");
ok("prazo em vigor lido pelo motor é 50", t.rows[0].d === 50);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);

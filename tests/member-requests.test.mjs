import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0216_pedido_e_convite_de_membro.sql", import.meta.url), "utf8");
const plan = readFileSync(new URL("../supabase/migrations/0217_pedido_de_membro_so_com_area_de_membros.sql", import.meta.url), "utf8");

test("migração 0216: tabela fechada (RLS, sem permissão direta) e um pedido pendente por casa e pessoa", () => {
  assert.match(sql, /alter table public\.member_requests enable row level security/);
  assert.match(sql, /revoke all on public\.member_requests from public, anon, authenticated/);
  assert.match(sql, /create unique index if not exists member_requests_one_pending on public\.member_requests \(house_id, user_id\) where status = 'pendente'/);
});

test("migração 0216: só o destinatário responde (casa responde pedido, pessoa responde convite) e só quem enviou cancela", () => {
  assert.match(sql, /\(r\.direction = 'pedido' and h\.owner_id = uid\) or \(r\.direction = 'convite' and r\.user_id = uid\)/);
  assert.match(sql, /\(r\.direction = 'pedido' and r\.user_id = uid\) or \(r\.direction = 'convite' and h\.owner_id = uid\)/);
});

test("migração 0216: convite só a quem já conversou, bloqueio e espera de 7 dias valem nos dois sentidos, limites diários", () => {
  assert.match(sql, /Só dá para convidar quem já conversou com a casa pelo chat/);
  assert.match(sql, /member_req_blocked\(uid, p_owner\)/);
  assert.match(sql, /member_req_blocked\(uid, p_user\)/);
  assert.match(sql, /status = 'recusado' and decided_at > now\(\) - interval '7 days'/);
  assert.match(sql, />= 10 then raise exception 'Você já enviou muitos pedidos hoje/);
  assert.match(sql, />= 20 then raise exception 'Muitos convites hoje/);
});

test("migração 0216: aceitar vira membro com as regras do convite por link (padrões da casa, consentimento, limite de 500)", () => {
  assert.match(sql, /house_member_settings/);
  assert.match(sql, /consent_at, consent_version/);
  assert.match(sql, />= 500 then raise exception 'Esta casa atingiu o limite de membros/);
  assert.match(sql, /member_ensure_due\(mid, cur\)/);
});

test("migração 0216: recusa é silenciosa; aceite avisa quem enviou; limpeza diária", () => {
  const recusa = sql.slice(sql.indexOf("if p_accept is not true"), sql.indexOf("select id into mid"));
  assert.doesNotMatch(recusa, /notifications/);
  assert.match(sql, /aceitou o seu pedido/);
  assert.match(sql, /aceitou o convite e agora é membro/);
  assert.match(sql, /cron\.schedule\('member-requests-clean'/);
  assert.match(sql, /revoke execute on function[\s\S]*from public, anon;/);
});

test("migração 0217: pedido e convite só com a área de membros no plano", () => {
  assert.equal((plan.match(/plan_cap_bool\(h\.plan::text, ''members_area''\)/g) ?? []).length, 3);
  assert.match(plan, /texto não encontrado em member_request_create/);
});

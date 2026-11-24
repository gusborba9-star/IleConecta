import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sql = read("../supabase/migrations/0204_consulta_video_no_pedido.sql").replace(/--.*$/gm, "");

test("0204: consulta só em pedido já pago e em curso", () => {
  const f = sql.split("function public.video_schedule")[1].split("end $$;")[0];
  assert.match(f, /o\.status in \('confirmado', 'em_andamento'\)/);
  assert.doesNotMatch(f, /aguardando_pagamento/);
  assert.match(sql, /status in \('confirmado', 'em_andamento'\)\)\s*\$\$;/);
});

test("0204: pedido que sai de ativo cancela as consultas marcadas e a entrada/lista conferem o pedido", () => {
  assert.match(sql, /after update of status on public\.service_orders/);
  assert.match(sql, /kind = 'consulta' and status = 'agendada'/);
  assert.match(sql.split("function public.video_join_check")[1], /video_order_active\(m\.order_id\)/);
  assert.match(sql.split("function public.video_my_upcoming")[1], /m\.kind = 'reuniao' or public\.video_order_active\(m\.order_id\)/);
});

test("0204: a leitura por pedido só abre para a dona da casa e para o cliente convidado, sem nome de sala", () => {
  const f = sql.split("function public.video_order_meetings")[1].split("$$;")[0];
  assert.match(f, /h\.owner_id = auth\.uid\(\) or m\.invitee_id = auth\.uid\(\)/);
  assert.doesNotMatch(f, /room_name/);
  assert.match(sql, /revoke all on function public\.video_order_active\(uuid\), public\.video_order_closed\(\), public\.video_order_meetings\(uuid\[\]\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.video_order_meetings\(uuid\[\]\) to authenticated/);
});

test("telas: o pedido da casa oferece 'Marcar consulta', o do cliente mostra o horário e 'Entrar', e Reuniões abre já com o pedido escolhido", () => {
  const comp = read("../src/components/services/OrderVideo.tsx");
  assert.match(comp, /\/reunioes\?pedido=/);
  assert.match(comp, /\/reunioes\/\$\{m\.id\}/);
  assert.match(read("../src/components/services/ServicesTab.tsx"), /<OrderVideo orderId=\{o\.id\}[^>]*schedulable=\{videoOn\}/);
  assert.match(read("../src/pages/Activity.tsx"), /<OrderVideo orderId=\{o\.id\}/);
  const r = read("../src/pages/Reunioes.tsx");
  assert.match(r, /params\.get\("pedido"\)/);
  assert.match(r, /\[0-9a-f-\]\{36\}/);
  assert.match(read("../src/lib/video.ts"), /\.in\("status", \["confirmado", "em_andamento"\]\)/);
});

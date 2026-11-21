import test from "node:test";
import assert from "node:assert/strict";
import { buildClientItems, criticalItems, todayBR } from "../src/lib/clientHomeCore.js";

const today = "2026-11-21";
const kinds = (x) => x.map((i) => i.kind);

test("nada acontecendo: lista vazia", () => assert.deepEqual(buildClientItems({ today }), []));

test("pedido aguardando pagamento é crítico; em andamento e confirmado são informativos", () => {
  const items = buildClientItems({ today, orders: [{ id: "1", title: "Jogo de búzios", status: "aguardando_pagamento", houseName: "Casa A" }, { id: "2", title: "Limpeza", status: "em_andamento" }, { id: "3", title: "X", status: "confirmado" }, { id: "4", title: "Y", status: "concluido" }, { id: "5", title: "Z", status: "cancelado" }] });
  assert.deepEqual(kinds(items), ["pagar_pedido", "pedido_andamento", "pedido_confirmado"]);
  assert.deepEqual(kinds(criticalItems(items)), ["pagar_pedido"]);
  assert.equal(items[0].detail, "Jogo de búzios · Casa A");
});

test("mensalidade: vencida é crítica; até 5 dias é aviso; depois disso, nada; paga/dispensada ignoradas", () => {
  const m = (due, status = "aberta") => [{ memberId: "m", houseName: "Casa B", dues: [{ id: "d" + due, dueDate: due, status, amountCents: 5000 }] }];
  assert.deepEqual(kinds(buildClientItems({ today, memberships: m("2026-11-20") })), ["mensalidade_vencida"]);
  assert.equal(buildClientItems({ today, memberships: m("2026-11-21") })[0].title, "Mensalidade vence hoje");
  assert.equal(buildClientItems({ today, memberships: m("2026-11-22") })[0].title, "Mensalidade vence em 1 dia");
  assert.equal(buildClientItems({ today, memberships: m("2026-11-26") })[0].title, "Mensalidade vence em 5 dias");
  assert.deepEqual(buildClientItems({ today, memberships: m("2026-11-27") }), []);
  assert.deepEqual(buildClientItems({ today, memberships: m("2026-11-01", "paga") }), []);
  assert.deepEqual(buildClientItems({ today, memberships: m("2026-11-01", "dispensada") }), []);
});

test("várias mensalidades em aberto: um item só, pela mais antiga, com a contagem", () => {
  const dues = [{ id: "a", dueDate: "2026-10-10", status: "aberta", amountCents: 1 }, { id: "b", dueDate: "2026-11-10", status: "aberta", amountCents: 1 }];
  const [i] = buildClientItems({ today, memberships: [{ memberId: "m", houseName: "Casa B", dues }] });
  assert.equal(i.kind, "mensalidade_vencida");
  assert.match(i.detail, /2 em aberto/);
});

test("reservas: pagar é crítico; confirmada só aparece até 2 dias antes; passadas somem", () => {
  const r = (status, startsAt, id = "r") => ({ id, status, title: "Ritual", houseName: "Casa C", startsAt });
  assert.deepEqual(kinds(buildClientItems({ today, reservations: [r("aguardando_pagamento", "2026-11-30T20:00:00Z")] })), ["pagar_reserva"]);
  assert.equal(buildClientItems({ today, reservations: [r("confirmada", "2026-11-21T22:00:00Z")] })[0].title, "Seu ritual é hoje");
  assert.equal(buildClientItems({ today, reservations: [r("confirmada", "2026-11-22T22:00:00Z")] })[0].title, "Seu ritual é amanhã");
  assert.equal(buildClientItems({ today, reservations: [r("confirmada", "2026-11-23T22:00:00Z")] })[0].title, "Seu ritual é em 2 dias");
  assert.deepEqual(buildClientItems({ today, reservations: [r("confirmada", "2026-11-25T22:00:00Z")] }), []);
  assert.deepEqual(buildClientItems({ today, reservations: [r("confirmada", "2026-11-10T22:00:00Z"), r("aguardando_pagamento", "2026-11-10T22:00:00Z", "q")] }), []);
});

test("ordem: vencida primeiro, depois pagar, depois avisos", () => {
  const items = buildClientItems({ today,
    orders: [{ id: "1", title: "A", status: "em_andamento" }, { id: "2", title: "B", status: "aguardando_pagamento" }],
    memberships: [{ memberId: "m", houseName: "C", dues: [{ id: "d", dueDate: "2026-11-01", status: "aberta", amountCents: 1 }] }] });
  assert.deepEqual(kinds(items), ["mensalidade_vencida", "pagar_pedido", "pedido_andamento"]);
});

test("todayBR usa o dia de São Paulo (21h de 20/11 em SP ainda é dia 20, mesmo já sendo 21 em UTC)", () => {
  assert.equal(todayBR(new Date("2026-11-21T01:30:00Z")), "2026-11-20");
  assert.equal(todayBR(new Date("2026-11-21T12:00:00Z")), "2026-11-21");
});

import test from "node:test";
import assert from "node:assert/strict";
import { AFTER_PAYMENT, SEGMENTS, cardHint, chatStatus, dateTile, primaryLabel, serviceSegment, slotChipLabel, timeLabel } from "../src/lib/cardsCore.js";

test("segmento do serviço: agenda = jogo; trabalho e limpeza = trabalho; resto = serviço", () => {
  assert.equal(serviceSegment({ bookable: true, kind: "buzios" }), "jogo");
  assert.equal(serviceSegment({ bookable: false, kind: "trabalho" }), "trabalho");
  assert.equal(serviceSegment({ bookable: false, kind: "limpeza" }), "trabalho");
  assert.equal(serviceSegment({ bookable: false, kind: "cartas" }), "servico");
  assert.equal(serviceSegment(null), "servico");
  assert.deepEqual(Object.keys(SEGMENTS), ["ritual", "jogo", "servico", "trabalho"]);
});

test("horários no fuso de Brasília: chip, hora e bloco de data", () => {
  const now = new Date("2026-11-01T22:00:00Z"); // 19h em Brasília, domingo 01/11
  assert.equal(timeLabel("2026-11-01T22:30:00Z"), "19h30");
  assert.equal(timeLabel("2026-11-02T13:00:00Z"), "10h");
  assert.equal(slotChipLabel("2026-11-01T22:30:00Z", now), "Hoje 19h30");
  assert.equal(slotChipLabel("2026-11-02T13:00:00Z", now), "Amanhã 10h");
  assert.equal(slotChipLabel("2026-11-04T18:00:00Z", now), "Qua 15h");
  // 01h UTC ainda é o dia anterior em Brasília
  assert.equal(slotChipLabel("2026-11-02T01:00:00Z", now), "Hoje 22h");
  assert.deepEqual(dateTile("2026-11-14T22:00:00Z"), { month: "NOV", day: "14", when: "Sábado, às 19h" });
});

test("botão principal por tipo e com horário escolhido", () => {
  assert.equal(primaryLabel("ritual"), "Participar");
  assert.equal(primaryLabel("jogo"), "Agendar horário");
  assert.equal(primaryLabel("jogo", "2026-11-01T22:30:00Z"), "Agendar 19h30");
  assert.equal(primaryLabel("servico"), "Contratar");
  assert.equal(primaryLabel("trabalho"), "Contratar");
});

test("frase do card só fala de pagamento quando ele existe", () => {
  assert.match(cardHint("ritual", true), /faça o pagamento e sua vaga é confirmada/);
  assert.match(cardHint("jogo", true), /agendada automaticamente/);
  assert.match(cardHint("trabalho", true), /iniciar e concluir/);
  for (const s of ["ritual", "jogo", "servico", "trabalho"]) assert.match(cardHint(s, false), /combinado com a casa/);
  assert.match(cardHint("servico", true, true), /direto com a casa/);
});

test("status do Conversar: casa online, assistente ou casa responde ao voltar", () => {
  assert.equal(chatStatus({ online: true, hasAssistant: true }), "a casa está online");
  assert.equal(chatStatus({ online: false, hasAssistant: true }), "a assistente atende agora");
  assert.equal(chatStatus({ online: false, hasAssistant: false }), "a casa responde quando voltar");
  assert.match(AFTER_PAYMENT, /Fique atento às suas notificações\.$/);
});

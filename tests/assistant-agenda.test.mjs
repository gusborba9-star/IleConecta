import test from "node:test";
import assert from "node:assert/strict";
import { agendaTime, buildSystemPrompt, normalizeAgenda } from "../supabase/functions/assistant-chat/logic.js";

const NOW = new Date("2026-10-31T23:30:00Z"); // 20:30 em Brasília, ainda 31/10
const base = { title: "Gira de Quimbanda", kind: "gira", on_date: "2026-11-15", on_time: "21:00:00", yearly: false, note: "Roupa preta.", vis_assistant: true };

test("horário legível", () => {
  assert.equal(agendaTime("21:00"), "21h");
  assert.equal(agendaTime("20:30:00"), "20h30");
  assert.equal(agendaTime(null), "");
  assert.equal(agendaTime("25:00"), "");
});

test("a assistente recebe data, dia da semana, horário, tipo e orientações da casa", () => {
  const [line] = normalizeAgenda([base], NOW);
  assert.match(line, /Gira de Quimbanda \[Cerimônia\]/);
  assert.match(line, /15 de novembro de 2026 \(domingo\), às 21h — em 15 dias/);
  assert.match(line, /orientações da casa: Roupa preta\./);
});

test("sem horário cadastrado, avisa que o horário não foi informado", () => {
  const [line] = normalizeAgenda([{ ...base, on_time: null }], NOW);
  assert.match(line, /horário não informado/);
});

test("só entra o que a casa liberou para a assistente", () => {
  assert.equal(normalizeAgenda([{ ...base, vis_assistant: false }], NOW).length, 0);
  assert.equal(normalizeAgenda([{ ...base, vis_assistant: undefined }], NOW).length, 0);
});

test("data passada sem repetição e data além do horizonte ficam de fora; anual vira a próxima ocorrência", () => {
  assert.equal(normalizeAgenda([{ ...base, on_date: "2026-10-30" }], NOW).length, 0);
  assert.equal(normalizeAgenda([{ ...base, on_date: "2027-06-01" }], NOW).length, 0);
  const [yearly] = normalizeAgenda([{ ...base, on_date: "2020-12-08", yearly: true }], NOW);
  assert.match(yearly, /8 de dezembro de 2026/);
  const [over] = normalizeAgenda([{ ...base, on_date: "2020-01-05", yearly: true }], new Date("2026-12-20T15:00:00Z")); // próxima: 5/1/2027
  assert.match(over, /5 de janeiro de 2027/);
});

test("usa o dia de Brasília, não o de UTC", () => {
  const [line] = normalizeAgenda([{ ...base, on_date: "2026-11-01" }], new Date("2026-11-01T23:30:00Z"));
  assert.match(line, /— hoje/);
  const none = normalizeAgenda([{ ...base, on_date: "2026-11-01" }], new Date("2026-11-02T02:30:00Z")); // 23h30 de 1/11 em Brasília, ainda hoje
  assert.equal(none.length, 1);
  assert.equal(normalizeAgenda([{ ...base, on_date: "2026-11-01" }], new Date("2026-11-02T03:30:00Z")).length, 0); // 00h30 de 2/11
});

test("ordena pela data e pelo horário, e limita a 20", () => {
  const items = [
    { ...base, title: "Bb", on_date: "2026-11-20", on_time: "20:00" },
    { ...base, title: "Aa", on_date: "2026-11-20", on_time: "09:00" },
    { ...base, title: "Cc", on_date: "2026-11-10", on_time: null },
  ];
  assert.deepEqual(normalizeAgenda(items, NOW).map((l) => l.slice(0, 2)), ["Cc", "Aa", "Bb"]);
  const many = Array.from({ length: 30 }, (_, i) => ({ ...base, title: `Data ${i}`, on_date: "2026-11-20" }));
  assert.equal(normalizeAgenda(many, NOW).length, 20);
});

test("29 de fevereiro cai em 28 em ano comum", () => {
  const [l] = normalizeAgenda([{ ...base, on_date: "2024-02-29", yearly: true }], new Date("2027-02-01T15:00:00Z"));
  assert.match(l, /28 de fevereiro de 2027/);
});

const house = { name: "Casa Teste", category: "Umbanda" };
const assistant = { display_name: "Luz", profile: {} };
const prompt = (agenda) => buildSystemPrompt({ house, assistant, services: [], events: [], plan: "pro", agenda, now: NOW });

test("prompt: com o calendário desligado (agenda=null) nada muda", () => {
  const p = prompt(null);
  assert.ok(!p.includes("AGENDA DA CASA"));
});

test("prompt: traz a agenda e a regra de não inventar", () => {
  const p = prompt(normalizeAgenda([base], NOW));
  assert.match(p, /AGENDA DA CASA \(datas liberadas/);
  assert.match(p, /Gira de Quimbanda \[Cerimônia\]/);
  assert.match(p, /Nunca invente horário, local, roupa, valor ou vaga/);
  assert.match(p, /não reserva vaga nem confirma presença/);
});

test("prompt: agenda vazia manda confirmar com a casa", () => {
  const p = prompt([]);
  assert.match(p, /nenhuma data liberada no momento/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildGreeting, buildSystemPrompt, firstName, greetingWord } from "../supabase/functions/assistant-chat/logic.js";

const at = (hourBrt) => new Date(Date.UTC(2026, 9, 27, hourBrt + 3, 30));

test("saudação conforme o horário de Brasília", () => {
  assert.equal(greetingWord(at(4)), "Boa noite");
  assert.equal(greetingWord(at(5)), "Bom dia");
  assert.equal(greetingWord(at(11)), "Bom dia");
  assert.equal(greetingWord(at(12)), "Boa tarde");
  assert.equal(greetingWord(at(17)), "Boa tarde");
  assert.equal(greetingWord(at(18)), "Boa noite");
  assert.equal(greetingWord(at(23)), "Boa noite");
  assert.equal(greetingWord(at(0)), "Boa noite");
});

test("primeiro nome: só usa quando é seguro", () => {
  assert.equal(firstName("Gustavo dos Santos Borba"), "Gustavo");
  assert.equal(firstName("MARIA"), "Maria");
  assert.equal(firstName("  joão  "), "João");
  assert.equal(firstName("gus@gmail.com"), "");
  assert.equal(firstName("User123"), "");
  assert.equal(firstName(""), "");
  assert.equal(firstName(undefined), "");
});

test("apresentação funciona com nome feminino, masculino e sem nome definido", () => {
  const base = { houseName: "Gezebel", now: at(16) };
  assert.equal(
    buildGreeting({ ...base, clientName: "Gustavo Borba", assistantName: "Lara" }),
    "Boa tarde, Gustavo! Aqui é Lara, assistente virtual da casa Gezebel. Estou aqui para ajudar no que for preciso.",
  );
  assert.match(buildGreeting({ ...base, clientName: "x@y.com", assistantName: "Rafael" }), /^Boa tarde! Aqui é Rafael, assistente virtual/);
  assert.match(buildGreeting({ ...base, clientName: "Ana", assistantName: "Assistente" }), /^Boa tarde, Ana! Sou a assistente virtual da casa Gezebel\./);
});

test("o prompt manda o modelo não repetir a saudação", () => {
  const p = buildSystemPrompt({
    house: { name: "Casa Luz" }, plan: "maximo", services: [], events: [],
    assistant: { enabled: true, display_name: "Luz", business_hours: {} },
  });
  assert.match(p, /Nunca repita saudação/);
});

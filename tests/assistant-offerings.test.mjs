import test from "node:test";
import assert from "node:assert/strict";
import { HANDOFF_MARK, buildSystemPrompt } from "../supabase/functions/assistant-chat/logic.js";

const assistant = { enabled: true, display_name: "Luz", instructions: "", business_hours: { seg: "9h às 18h" }, can_sell: false, can_discount: false, max_discount_percent: 0, profile: {} };

test("prompt traz o texto 'o que a casa faz', mesmo sem serviços nem rituais publicados", () => {
  const prompt = buildSystemPrompt({
    house: { name: "Casa Luz", offerings: "Trabalhos para todos os fins:\n amor, prosperidade, abertura de caminhos. Jogo de búzios." },
    plan: "intermediario", services: [], events: [], assistant,
  });
  assert.match(prompt, /TRABALHOS QUE A CASA REALIZA/);
  assert.match(prompt, /Trabalhos para todos os fins: amor, prosperidade, abertura de caminhos\. Jogo de búzios\./);
  assert.match(prompt, /\(nenhum cadastrado\)/);
});

test("regras: apresentar a casa, passar para a casa trabalho não publicado, nunca dizer que agendou nem dar preço", () => {
  const prompt = buildSystemPrompt({ house: { name: "Casa Luz", offerings: "Búzios" }, plan: "intermediario", services: [], events: [], assistant });
  assert.match(prompt, /conhecer a casa ou perguntar o que a casa faz/);
  assert.match(prompt, /não está publicado.*termine com \[\[CASA\]\]/s);
  assert.match(prompt, /nunca diga que marcou, agendou ou reservou/);
  assert.match(prompt, /nunca informe valor deles/);
  assert.ok(prompt.includes(HANDOFF_MARK));
});

test("sem o texto da casa, a seção não aparece; texto enorme é cortado", () => {
  const none = buildSystemPrompt({ house: { name: "Casa Luz" }, plan: "intermediario", services: [], events: [], assistant });
  assert.equal(none.includes("TRABALHOS QUE A CASA REALIZA (escrito"), false);
  const big = buildSystemPrompt({ house: { name: "Casa Luz", offerings: "x".repeat(5000) }, plan: "intermediario", services: [], events: [], assistant });
  assert.ok(!big.includes("x".repeat(801)));
});

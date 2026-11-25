import test from "node:test";
import assert from "node:assert/strict";
import { INTENTS, intentOf, matchesIntent } from "../src/lib/intentsCore.js";

test("intentOf reconhece nome, termo e prefixo, sem acento", () => {
  assert.equal(intentOf("Proteção")?.id, "protecao");
  assert.equal(intentOf("protecao")?.id, "protecao");
  assert.equal(intentOf("dinheiro")?.id, "prosperidade");
  assert.equal(intentOf("casam")?.id, "amor");
  assert.equal(intentOf("jogo de búzios")?.id, "orientacao");
});
test("intentOf ignora texto curto ou de nome de casa", () => {
  assert.equal(intentOf("am"), null);
  assert.equal(intentOf("Ilê Axé Alfa"), null);
  assert.equal(intentOf(""), null);
});
test("matchesIntent procura os termos nos textos da casa", () => {
  const amor = INTENTS.find((i) => i.id === "amor");
  assert.equal(matchesIntent(amor, ["Casa Axé", "Trabalho de união e reconciliação"]), true);
  assert.equal(matchesIntent(amor, ["Casa Axé", "Aulas de culinária"]), false);
  assert.equal(matchesIntent(null, ["amor"]), false);
});

test("matchesIntent não acha termo no meio de outra palavra (procura, reunião, passeio)", () => {
  const saude = INTENTS.find((i) => i.id === "saude");
  const amor = INTENTS.find((i) => i.id === "amor");
  assert.equal(matchesIntent(saude, ["Casa Axé", "Quem procura acolhimento encontra aqui"]), false, "procura contém cura");
  assert.equal(matchesIntent(saude, ["Casa Axé", "Passeio de domingo"]), false, "passeio contém passe");
  assert.equal(matchesIntent(amor, ["Casa Axé", "Reunião por vídeo toda quarta"]), false, "reunião contém união");
  assert.equal(matchesIntent(saude, ["Casa Axé", "Trabalho de cura e passe"]), true);
  assert.equal(matchesIntent(saude, ["Casa Axé", "Curas espirituais"]), true, "plural continua valendo");
  assert.equal(matchesIntent(amor, ["Casa Axé", "Trabalho de União e Reconciliação"]), true, "acento e maiúscula não atrapalham");
});

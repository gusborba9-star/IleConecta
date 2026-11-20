import test from "node:test";
import assert from "node:assert/strict";
import { hasAppHistory, parentOf, showBack } from "../src/lib/backNavCore.js";

test("Voltar não aparece nas telas principais nem onde a tela já tem o próprio caminho", () => {
  for (const p of ["/", "/mensagens", "/pedidos", "/agenda", "/descobrir", "/rituais", "/mensagens/abc", "/admin", "/pagamento/retorno", "/convite/x"]) assert.equal(showBack(p), false, p);
});
test("Voltar aparece nas demais telas internas", () => {
  for (const p of ["/planos", "/recebimentos", "/pessoas", "/perfil", "/casa/123", "/rituais/9", "/impulsionar", "/destaques", "/suporte", "/planos/"]) assert.equal(showBack(p), true, p);
});
test("sem histórico no app, vai para a tela mãe (nunca sai do app)", () => {
  assert.equal(parentOf("/rituais/9"), "/rituais");
  assert.equal(parentOf("/destaques"), "/impulsionar");
  assert.equal(parentOf("/planos"), "/");
  assert.equal(parentOf(""), "/");
});
test("histórico do app: só vale com posição maior que zero", () => {
  assert.equal(hasAppHistory({ idx: 2 }), true);
  assert.equal(hasAppHistory({ idx: 0 }), false);
  assert.equal(hasAppHistory(null), false);
  assert.equal(hasAppHistory({ idx: "3" }), false);
});

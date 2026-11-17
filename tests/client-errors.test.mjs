import test from "node:test";
import assert from "node:assert/strict";
import { criarRelator, deveIgnorar, limpar, textoDoErro, MAX_POR_ABERTURA } from "../src/lib/clientErrorsCore.js";

test("o que é ruído não é relatado; o que é defeito é", () => {
  for (const t of ["ResizeObserver loop completed with undelivered notifications.", "Script error.", "Script error", "TypeError: Failed to fetch", "TypeError: Failed to fetch at fn (a.js:1:2)", "Load failed", "AbortError: The user aborted a request.", "Error at chrome-extension://abc/x.js:1:1", "Non-Error promise rejection captured with value: 3", "", " ", "x", null, undefined]) {
    assert.equal(deveIgnorar(t), true, String(t));
  }
  for (const t of ["TypeError: Cannot read properties of undefined (reading 'name')", "TypeError: Failed to fetch dynamically imported module: https://x/assets/Terms-abc.js", "Error: Rendering fez algo errado", "ReferenceError: foo is not defined"]) {
    assert.equal(deveIgnorar(t), false, t);
  }
});

test("texto do erro: nome, mensagem e primeira linha da pilha; aceita texto puro e valores estranhos", () => {
  const e = new TypeError("x is undefined");
  e.stack = "TypeError: x is undefined\n    at ver (https://site/assets/a.js:10:5)\n    at outro (https://site/assets/b.js:1:1)";
  assert.equal(textoDoErro(e), "TypeError: x is undefined at ver (https://site/assets/a.js:10:5)");
  assert.equal(textoDoErro("falhou"), "falhou");
  assert.equal(textoDoErro(null), "");
  assert.equal(textoDoErro(undefined), "");
  assert.equal(textoDoErro({}), "Error");
  assert.equal(textoDoErro({ message: 42 }), "Error");
  assert.equal(textoDoErro(Object.create(null)), "Error");
  assert.equal(textoDoErro(Symbol("s").description), "s");
});

test("limpeza: tira o endereço do site e limita o tamanho", () => {
  assert.equal(limpar("Erro em https://site.com/assets/a.js:1:2", "https://site.com"), "Erro em /assets/a.js:1:2");
  assert.equal(limpar("a".repeat(1000)).length, 380);
  assert.equal(limpar("  muitos   espaços\n\tmesmo  "), "muitos espaços mesmo");
});

test("relator: o mesmo erro na mesma tela vai uma vez; outra tela vai de novo; limite por abertura; nunca lança", async () => {
  const enviados = [];
  const r = criarRelator({ send: async (rota, msg) => { enviados.push([rota, msg]); } });
  const a = new Error("falha A");
  assert.equal(r(a, "/casa/1?token=segredo#x"), true);
  assert.equal(r(a, "/casa/1"), false, "repetido (a consulta e o # não contam)");
  assert.equal(r(a, "/perfil"), true, "outra tela");
  assert.equal(r("Script error.", "/x"), false);
  assert.deepEqual(enviados[0][0], "/casa/1");
  assert.ok(!JSON.stringify(enviados).includes("segredo"), "a consulta (que pode ter token) nunca sai");
  for (let i = 0; i < 30; i++) r(new Error("distinto " + i), "/z");
  assert.equal(enviados.length, MAX_POR_ABERTURA, "no máximo 8 relatos por abertura");
  // send que lança de forma síncrona ou rejeita não derruba nada
  const ruim = criarRelator({ send: () => { throw new Error("boom"); } });
  assert.doesNotThrow(() => ruim(new Error("a"), "/"));
  const rejeita = criarRelator({ send: () => Promise.reject(new Error("rede")) });
  assert.doesNotThrow(() => rejeita(new Error("b"), "/"));
  await new Promise((res) => setTimeout(res, 10)); // sem rejeição não tratada
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { routeTitle, withBrand } from "../src/lib/routeTitleCore.js";

test("título por tela: exatos, prefixos, barra final, página pública e desconhecida", () => {
  assert.equal(routeTitle("/"), "Início");
  assert.equal(routeTitle("/planos"), "Planos e faturas");
  assert.equal(routeTitle("/planos/"), "Planos e faturas");
  assert.equal(routeTitle("/pedidos"), "Pedidos");
  assert.equal(routeTitle("/recebimentos"), "Recebimentos");
  assert.equal(routeTitle("/rituais/abc"), "Ritual");
  assert.equal(routeTitle("/suporte/chamados"), "Meus chamados");
  assert.equal(routeTitle("/suporte/chamados/123"), "Chamado");
  assert.equal(routeTitle("/c/minha-casa"), null);
  assert.equal(routeTitle("/nada-aqui"), "Página não encontrada");
  assert.equal(routeTitle(undefined), "Início");
  assert.equal(withBrand("Planos"), "Planos · Ilê Conecta");
  assert.equal(withBrand("Início"), "Ilê Conecta");
  assert.equal(withBrand(null), "Ilê Conecta");
});

test("toda rota do App tem título (rota nova sem título falha aqui)", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const rotas = [...app.matchAll(/<Route path="(\/[^"*]*)"/g)].map((m) => m[1]);
  assert.ok(rotas.length > 25);
  for (const r of rotas) {
    const exemplo = r.replace(/:[a-z]+/gi, "x");
    const t = routeTitle(exemplo);
    assert.ok(t === null || t !== "Página não encontrada", `sem título: ${r}`);
  }
});

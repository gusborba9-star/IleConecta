import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODULE_KEYS, readAccess, NO_ACCESS } from "../src/lib/adminAccessCore.js";
import { ADMIN_SCREENS, ADMIN_MODULES, ADMIN_GROUPS, BAR_PRIORITY, screensOf, visibleModules, resolveNav, navPath, adminTo, searchScreens, screenById } from "../src/lib/adminNavCore.js";
const acc = (owner, perms = []) => readAccess({ admin: true, owner, perms });
const ids = (list) => list.map((x) => x.id);

test("mapa do painel: ids únicos, tela em módulo real, permissão real, módulo com tela e grupo no menu", () => {
  assert.equal(new Set(ids(ADMIN_SCREENS)).size, ADMIN_SCREENS.length);
  assert.equal(new Set(ids(ADMIN_MODULES)).size, ADMIN_MODULES.length);
  for (const s of ADMIN_SCREENS) {
    assert.ok(ADMIN_MODULES.some((m) => m.id === s.module), `${s.id}: módulo ${s.module} não existe`);
    assert.ok(s.need === "dono" || MODULE_KEYS.includes(s.need), `${s.id}: permissão ${s.need} inválida`);
    assert.ok(/^[a-z0-9-]{1,40}$/.test(s.id) && s.title.length > 3 && s.desc.length > 10, s.id);
  }
  for (const m of ADMIN_MODULES) { assert.ok(ADMIN_SCREENS.some((s) => s.module === m.id), `módulo ${m.id} sem tela`); assert.ok(ADMIN_GROUPS.includes(m.group)); }
  for (const id of BAR_PRIORITY) assert.ok(ADMIN_MODULES.some((m) => m.id === id));
});

test("toda tela do mapa tem o que mostrar no painel (e o painel não mostra tela fora do mapa)", () => {
  const shell = readFileSync(new URL("../src/pages/AdminShell.tsx", import.meta.url), "utf8");
  const inline = (shell.match(/const INLINE = new Set<string>\(\[([^\]]*)\]/)?.[1] ?? "").match(/"([a-z0-9-]+)"/g)?.map((x) => x.replace(/"/g, "")) ?? [];
  const cardsBlock = shell.slice(shell.indexOf("const CARDS"), shell.indexOf("// Ajustes de largura"));
  const cards = [...cardsBlock.matchAll(/(?:^|[\s,{])"?([a-z0-9-]+)"?: <[A-Z]/g)].map((m) => m[1]);
  for (const s of ADMIN_SCREENS) assert.ok(inline.includes(s.id) || cards.includes(s.id), `tela '${s.id}' sem conteúdo no AdminShell`);
  for (const id of [...inline, ...cards]) assert.ok(screenById(id), `AdminShell mostra '${id}', que não está no mapa`);
  assert.equal(new Set([...inline, ...cards]).size, ADMIN_SCREENS.length);
  const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
  for (const id of inline) assert.ok(admin.includes(`screen === "${id}"`), `Admin.tsx não desenha '${id}'`);
});

test("permissões: dono vê tudo; sem módulo não vê nada; cada módulo de acesso abre só o seu", () => {
  assert.equal(ADMIN_SCREENS.filter((s) => screensOf(acc(true), s.module).includes(s)).length, ADMIN_SCREENS.length);
  assert.deepEqual(visibleModules(acc(false, [])), []);
  assert.deepEqual(visibleModules(NO_ACCESS), []);
  assert.deepEqual(visibleModules(null), []);
  assert.deepEqual(ids(visibleModules(acc(false, ["suporte"]))), ["suporte"]);
  assert.deepEqual(ids(visibleModules(acc(false, ["contas"]))), []);
  assert.deepEqual(ids(visibleModules(acc(false, ["moderacao"]))), ["moderacao"]);
  assert.deepEqual(ids(screensOf(acc(false, ["moderacao"]), "moderacao")), ["avaliacoes", "denuncias-chat", "moderacao", "momentos"]); // "Biblioteca de músicas" é só do dono
  assert.deepEqual(ids(visibleModules(acc(false, ["indicadores"]))), ["numeros", "usuarios", "equipe", "dinheiro"]);
  assert.deepEqual(ids(screensOf(acc(false, ["indicadores"]), "dinheiro")), ["financeiro"]);
  assert.deepEqual(ids(visibleModules(acc(false, ["comunicacao"]))), ["equipe", "comunicacao"]);
  for (const k of MODULE_KEYS) for (const m of ["reembolsos", "docs", "historico", "plataforma", "assistente"]) assert.ok(!visibleModules(acc(false, [k])).some((x) => x.id === m), `${k} não abre ${m}`);
});

test("resolveNav: início, módulo, tela, módulo de uma tela só abre direto, antigos ?s=config e ?s=visao", () => {
  const o = acc(true);
  assert.equal(resolveNav(o, null, null).kind, "hub");
  assert.equal(resolveNav(o, "visao", null).kind, "hub");
  assert.equal(resolveNav(o, "inexistente", "x").kind, "hub");
  assert.equal(resolveNav(o, ["s"], {}).kind, "hub");
  const m = resolveNav(o, "dinheiro", null);
  assert.equal(m.kind, "module"); assert.ok(m.screens.length > 3);
  const s = resolveNav(o, "dinheiro", "taxas");
  assert.equal(s.kind, "screen"); assert.equal(s.screen.id, "taxas"); assert.equal(s.single, false);
  assert.equal(resolveNav(o, "dinheiro", "suporte").kind, "module"); // tela de outro módulo é ignorada
  assert.equal(resolveNav(o, "dinheiro", "nao-existe").kind, "module");
  const sup = resolveNav(o, "suporte", null);
  assert.equal(sup.kind, "screen"); assert.equal(sup.screen.id, "suporte"); assert.equal(sup.single, true);
  assert.equal(resolveNav(o, "config", null).module.id, "plataforma");
});

test("resolveNav: quem não tem acesso cai no início e nunca abre tela proibida; conta sem módulo = none", () => {
  const mod = acc(false, ["moderacao"]);
  assert.equal(resolveNav(mod, "dinheiro", "taxas").kind, "hub");
  assert.equal(resolveNav(mod, "moderacao", "musicas").kind, "module"); // existe, mas é do dono
  assert.equal(resolveNav(mod, "moderacao", "avaliacoes").screen.id, "avaliacoes");
  assert.equal(resolveNav(mod, "config", null).kind, "hub");
  assert.equal(resolveNav(acc(false, []), "suporte", null).kind, "none");
  assert.equal(resolveNav(NO_ACCESS, null, null).kind, "none");
});

test("endereços: só id seguro entra na URL", () => {
  assert.equal(navPath(), ""); assert.equal(navPath("dinheiro"), "?s=dinheiro"); assert.equal(navPath("dinheiro", "taxas"), "?s=dinheiro&c=taxas");
  assert.equal(navPath("a&b", "c d"), "?s=a%26b&c=c%20d");
  assert.deepEqual(adminTo("moderacao", "momentos"), { search: "?s=moderacao&c=momentos" });
});

test("busca: sem acento, todas as palavras, só telas permitidas, título primeiro, mínimo de 2 letras", () => {
  const o = acc(true);
  assert.equal(searchScreens(o, "t").length, 0);
  assert.equal(searchScreens(o, "  ").length, 0);
  assert.equal(searchScreens(o, "taxa")[0].id, "taxas");
  assert.equal(searchScreens(o, "MUSICA")[0].id, "musicas");
  assert.equal(searchScreens(o, "música")[0].id, "musicas");
  assert.ok(searchScreens(o, "reembolso").some((s) => s.id === "reembolsos"));
  assert.deepEqual(ids(searchScreens(o, "teto pagamento")), ["teto"]);
  assert.equal(searchScreens(o, "zzzzqq").length, 0);
  assert.ok(searchScreens(o, "de").length <= 8);
  const mod = acc(false, ["moderacao"]);
  assert.equal(searchScreens(mod, "taxa").length, 0);
  assert.equal(searchScreens(mod, "música").length, 0);
  assert.equal(searchScreens(mod, "denuncia")[0].module, "moderacao");
  assert.equal(searchScreens(NO_ACCESS, "taxa").length, 0);
});

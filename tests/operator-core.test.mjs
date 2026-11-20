import test from "node:test";
import assert from "node:assert/strict";
import { documentKind, operatorProblem, operatorSentence, OPERATOR_SLUGS } from "../src/lib/operatorCore.js";

const ok = { name: "Gustavo dos Santos Borba", document: "***.116.210-**", address: "", email: "" };

test("documento: só CPF mascarado ou CNPJ completo", () => {
  assert.equal(documentKind("***.116.210-**"), "cpf");
  assert.equal(documentKind("12.345.678/0001-95"), "cnpj");
  for (const bad of ["123.116.210-45", "12311621045", "***.116.210-*", "x***.116.210-**", "***.116.210-** x", "", null, undefined, "12345678000195", "***.***.***-**"]) assert.equal(documentKind(bad), null, String(bad));
});

test("validação: aceita o caso real e recusa o que não pode ser publicado", () => {
  assert.equal(operatorProblem(ok), null);
  assert.match(operatorProblem({ ...ok, document: "123.116.210-45" }), /CPF completo não pode ser publicado/);
  assert.match(operatorProblem({ ...ok, name: "Gu" }), /nome completo/);
  assert.match(operatorProblem({ ...ok, name: "<b>Gustavo</b>" }), /nome completo/);
  assert.match(operatorProblem({ ...ok, name: "A".repeat(121) }), /nome completo/);
  assert.match(operatorProblem({ ...ok, address: "Rua" }), /Endereço/);
  assert.match(operatorProblem({ ...ok, address: "Rua <script>" }), /Endereço/);
  assert.match(operatorProblem({ ...ok, email: "sem arroba" }), /E-mail/);
  assert.match(operatorProblem({ ...ok, email: "a@b" }), /E-mail/);
  assert.equal(operatorProblem({ ...ok, email: "contato@ileconecta.com.br", address: "Caixa postal 12, Salvador/BA" }), null);
  assert.ok(operatorProblem(null));
});

test("frase de abertura: CPF sem e-mail usa o suporte do app", () => {
  const t = operatorSentence({ name: "Gustavo dos Santos Borba", document: "***.116.210-**", address: null, email: null });
  assert.equal(t, "A plataforma Ilê Conecta é operada e administrada por Gustavo dos Santos Borba, inscrito(a) no CPF sob o nº ***.116.210-**, com canal de atendimento eletrônico pelo suporte interno do aplicativo.");
});

test("frase de abertura: CNPJ com endereço e e-mail", () => {
  const t = operatorSentence({ name: "Ilê Conecta Ltda", document: "12.345.678/0001-95", address: "Rua das Flores, 100, Salvador/BA", email: "contato@ileconecta.com.br" });
  assert.match(t, /inscrita no CNPJ sob o nº 12\.345\.678\/0001-95, com endereço em Rua das Flores, 100, Salvador\/BA, /);
  assert.match(t, /pelo e-mail contato@ileconecta\.com\.br ou pelo suporte interno do aplicativo\.$/);
});

test("frase de abertura: sem dados ou com documento não publicável, não mostra nada (falha segura)", () => {
  assert.equal(operatorSentence(null), null);
  assert.equal(operatorSentence({ name: "", document: "***.116.210-**" }), null);
  assert.equal(operatorSentence({ name: "Fulano", document: "123.456.789-09" }), null);
});

test("quatro páginas levam a identificação", () => {
  assert.deepEqual([...OPERATOR_SLUGS].sort(), ["normas-de-uso", "privacidade-lgpd", "termos-da-casa", "termos-do-cliente"]);
});

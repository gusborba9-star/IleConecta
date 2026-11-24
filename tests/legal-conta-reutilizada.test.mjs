import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGAL_VERSION, LEGAL_VERSION_HISTORY } from "../src/lib/legalCore.js";

const txt = readFileSync(new URL("../src/content/institutional.ts", import.meta.url), "utf8");

test("Termos: conta reutilizada vale para conta ativa ou encerrada e mantém o reembolso só quando já foi usado", () => {
  assert.match(txt, /esteja ela encerrada ou ativa/);
  assert.match(txt, /não é concedido novamente quando outra conta vinculada, encerrada ou ativa, já o tenha utilizado/);
  assert.match(txt, /apenas 1 \(uma\) conta por Casa Espiritual/);
  assert.match(txt, /sem obrigação de detalhar os critérios técnicos/);
});

test("Termos: a suspensão tem caminho de contestação", () => {
  assert.match(txt, /A suspensão pode ser contestada pelo chamado/);
});

test("Política: registros de segurança e dispositivos com prazos de 12 e 24 meses na coleta e na retenção", () => {
  assert.match(txt, /Registros de segurança e dispositivos: para proteger a sua conta/);
  assert.match(txt, /Registros de segurança e dispositivos \(código anônimo do dispositivo, sistema, navegador, data e hora\): 12 \(doze\) meses sem uso/);
  assert.match(txt, /e-mails vinculados a cada conta \(os atuais, os anteriores e os de contas excluídas\): até 5 \(cinco\) anos/);
});

test("a versão dos textos subiu junto com a mudança", () => {
  assert.equal(LEGAL_VERSION, "2026-11-rascunho-14");
  assert.equal(LEGAL_VERSION_HISTORY.at(-1), LEGAL_VERSION);
});

test("Política: o IP também serve para prevenir fraude, junto com o aparelho, e nunca bloqueia sozinho", () => {
  assert.match(txt, /junto com o código técnico do dispositivo, para prevenir fraudes, abusos e a criação de várias contas/);
  assert.match(txt, /O IP, sozinho, nunca é motivo de bloqueio/);
});

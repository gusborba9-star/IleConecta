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
  assert.equal(LEGAL_VERSION, "2026-11-rascunho-16");
  assert.equal(LEGAL_VERSION_HISTORY.at(-1), LEGAL_VERSION);
});

test("Política: o IP também serve para prevenir fraude, junto com o aparelho, e nunca bloqueia sozinho", () => {
  assert.match(txt, /junto com o código técnico do dispositivo, para prevenir fraudes, abusos e a criação de várias contas/);
  assert.match(txt, /O IP, sozinho, nunca é motivo de bloqueio/);
});

test("Política: IP por 6 meses com base no legítimo interesse (e na lei, quando aplicável), sem afirmar obrigação legal pura", () => {
  assert.match(txt, /Guardamos por 6 meses, com exclusão automática depois desse prazo, com base no nosso legítimo interesse de segurança e prevenção a fraudes/);
  assert.match(txt, /6 \(seis\) meses, com base no legítimo interesse de segurança e prevenção a fraudes e, quando aplicável, no cumprimento do art\. 15/);
  assert.doesNotMatch(txt, /conforme exigido pelo art\. 15 do Marco Civil/);
});

test("Termos: limites temporários por rede e regularização de gestão pelo suporte", () => {
  assert.match(txt, /limites temporários de tentativas de cadastro ou acesso originadas de uma mesma rede/);
  assert.match(txt, /a gestão da conta existente pode ser regularizada pelo suporte, sem criar uma conta nova/);
});

test("Política: impressão do cartão (só código irreversível, 24 meses, nunca bloqueia sozinha) e código da rede do cadastro (até 3 dias)", () => {
  assert.match(txt, /Guardamos somente um código irreversível dessa impressão, nunca o número, a validade ou o nome do titular, por 24 meses desde o último uso/);
  assert.match(txt, /Esse código, sozinho, nunca bloqueia uma contratação nem uma conta/);
  assert.match(txt, /guardamos por no máximo 3 dias um código irreversível da rede usada em cada tentativa de cadastro/);
  assert.match(txt, /Código irreversível da impressão do cartão de pagamento: 24 \(vinte e quatro\) meses desde o último uso/);
  assert.match(txt, /até 3 \(três\) dias;/);
});

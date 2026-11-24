import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync(new URL("../src/lib/remoteAuth.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/Register.tsx", import.meta.url), "utf8");

test("reenvio da confirmação usa o tipo signup e volta para o login do site", () => {
  const fn = auth.split("export async function remoteResendConfirmation")[1].split("export async function remoteLogout")[0];
  assert.match(fn, /supabase\.auth\.resend\(\{\s*type: "signup"/);
  assert.match(fn, /emailRedirectTo/);
  assert.match(fn, /translateAuthError\(error\.message\)/);
});

test("tela de confirmação: botão discreto, com espera de 60 s e só com servidor real", () => {
  assert.match(page, /setCooldown\(60\)/);
  assert.match(page, /disabled=\{cooldown > 0\}/);
  assert.match(page, /\{isRemoteAuth && \(/);
  assert.match(page, /Não chegou\? Reenviar e-mail/);
});

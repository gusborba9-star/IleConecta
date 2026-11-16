import test from "node:test";
import assert from "node:assert/strict";
import { userMessage } from "../src/lib/userMessage.js";

test("frases do produto passam; erros técnicos viram o texto de reserva", () => {
  for (const ok of ["CPF ou CNPJ inválido. Confira os números.", "A casa já está no limite de 20 vagas extras.", "Informe o CPF ou CNPJ da casa em Planos antes de contratar.", "O documento já foi informado. Para corrigir, fale com o Suporte."]) assert.equal(userMessage(ok, "x"), ok);
  for (const bad of ['relation "public.house_tax_ids" does not exist', "SQLSTATE 42P01", 'new row violates check constraint "x"', "permission denied for table house_tax_ids", "JWT expired", "duplicate key value violates unique constraint", 'null value in column "name"', "invalid input syntax for type uuid", "<script>alert(1)</script>", "{\"code\":\"PGRST301\"}", "function public.x(uuid) does not exist", "", "   ", null, undefined, 42, {}, "x".repeat(300), "12345"]) assert.equal(userMessage(bad, "reserva"), "reserva", String(bad).slice(0, 30));
  assert.equal(userMessage("???"), "");
});

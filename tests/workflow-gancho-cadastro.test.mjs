import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const y = readFileSync(new URL("../.github/workflows/enable-auth-hook.yml", import.meta.url), "utf8");
test("o workflow do gancho é manual, só na main, só mexe nos dois campos do gancho e não imprime o token", () => {
  assert.match(y, /on:\s+workflow_dispatch:/);
  assert.match(y, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(y, /hook_before_user_created_enabled\\": true, \\"hook_before_user_created_uri/);
  assert.match(y, /pg-functions:\/\/postgres\/public\/hook_before_user_created/);
  assert.doesNotMatch(y, /echo[^\n]*SUPABASE_ACCESS_TOKEN/);
  assert.match(y, /permissions:\s+contents: read/);
});

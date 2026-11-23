import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/0182_video_config_so_administracao.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
test("0182: só a administração lê a chave do vídeo; as outras continuam públicas", () => {
  assert.match(sql, /create policy settings_read on public\.platform_settings for select using \(key <> 'video' or public\.is_admin\(\)\)/);
});

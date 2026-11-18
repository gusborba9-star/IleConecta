// Peso das imagens do feed no celular: toda <img> de lista/feed carrega sob demanda; envios têm teto de tamanho.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FEED = ["src/components/feed/PostCard.tsx", "src/components/feed/StyledPostBody.tsx", "src/components/feed/RitualCard.tsx",
  "src/components/feed/MomentsRail.tsx", "src/components/layout/RightRail.tsx", "src/components/base/index.tsx", "src/pages/Discover.tsx"];

test("imagens do feed e das listas carregam só quando chegam perto da tela", () => {
  for (const f of FEED) {
    const tags = readFileSync(f, "utf8").match(/<img\b[^>]*>/g) ?? [];
    assert.ok(tags.length > 0, `${f} deveria ter <img>`);
    for (const t of tags) {
      assert.match(t, /loading="lazy"/, `${f}: ${t.slice(0, 80)} sem loading=lazy`);
      assert.match(t, /decoding="async"/, `${f}: ${t.slice(0, 80)} sem decoding=async`);
    }
  }
});

test("envios de foto são reduzidos no aparelho (teto de lado maior e qualidade)", () => {
  const up = readFileSync("src/lib/imageUpload.ts", "utf8");
  assert.match(up, /cover: 1280/); assert.match(up, /avatar: 512/);
  assert.match(readFileSync("src/lib/postImages.ts", "utf8"), /MAX_SIDE = 1280/);
  assert.match(readFileSync("src/components/feed/MomentComposer.tsx", "utf8"), /1440 \/ Math\.max/);
});

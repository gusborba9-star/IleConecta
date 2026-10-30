// Apaga de verdade os arquivos vencidos do armazenamento e depois limpa as referências no banco.
// Chamada só pelo agendador do banco (pg_cron), com o segredo no cabeçalho x-push-secret (guardado no Vault).
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Item { bucket: string; path: string; kind: string; ref: string }

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "metodo_nao_permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await admin.rpc("push_config");
  const sent = req.headers.get("x-push-secret") ?? "";
  if (!cfg?.webhook_secret || sent !== cfg.webhook_secret) return json(401, { error: "nao_autorizado" });

  let purged = 0;
  let failed = 0;
  for (let round = 0; round < 5; round++) {
    const { data, error } = await admin.rpc("files_to_purge", { p_limit: 100 });
    if (error) return json(500, { error: "consulta_falhou", purged, failed });
    const items = (data ?? []) as Item[];
    if (items.length === 0) break;

    const done: Item[] = [];
    const byBucket = new Map<string, Item[]>();
    for (const it of items) byBucket.set(it.bucket, [...(byBucket.get(it.bucket) ?? []), it]);
    for (const [bucket, list] of byBucket) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(list.map((i) => i.path));
      if (rmErr) failed += list.length;
      else done.push(...list);
    }
    if (done.length === 0) break; // nada saiu do armazenamento: não insiste hoje
    const { data: n } = await admin.rpc("files_purged", { p_items: done });
    purged += Number(n ?? 0);
    if (items.length < 100) break;
  }
  return json(200, { purged, failed });
});

// Envia a notificação ao celular (Web Push) quando uma notificação nova é criada.
// Chamada só pelo gatilho do banco, com o segredo no cabeçalho x-push-secret (guardado no Vault).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BCUR2tZ1IX9d_oGLmtfflaXRX0uefES6Jhtx8JpQAU7TlgR2Ria6eo587_jOn1tY4hhf20b4AekUHQ2PuBzWkYU";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "metodo_nao_permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await admin.rpc("push_config");
  const sent = req.headers.get("x-push-secret") ?? "";
  if (!cfg?.webhook_secret || !cfg?.vapid_private || sent !== cfg.webhook_secret) return json(401, { error: "nao_autorizado" });

  let body: { user_id?: string; text?: string; href?: string | null };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "json_invalido" });
  }
  if (typeof body.user_id !== "string" || typeof body.text !== "string") return json(400, { error: "dados_invalidos" });

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", body.user_id).limit(10);
  if (!subs?.length) return json(200, { sent: 0 });

  webpush.setVapidDetails("https://ile-conecta.vercel.app", VAPID_PUBLIC, cfg.vapid_private);
  const payload = JSON.stringify({
    title: "Ilê Conecta",
    body: body.text.slice(0, 200),
    url: typeof body.href === "string" && body.href.startsWith("/") ? body.href : "/",
  });

  let ok = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(s.id as string);
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return json(200, { sent: ok, removed: dead.length });
});

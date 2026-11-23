// Envia e-mail de aviso importante pelo Resend. Só chamada interna (chave de serviço); nunca exposta ao navegador.
import { createResendAdapter, EmailError, sendEmail } from "./core.js";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "metodo_nao_permitido" });
  let input: unknown;
  try { input = await req.json(); } catch { return json(400, { error: "json_invalido" }); }
  try {
    const adapter = createResendAdapter({ apiKey: Deno.env.get("RESEND_API_KEY") ?? "" });
    const out = await sendEmail({ adapter, serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", authHeader: req.headers.get("authorization") }, input);
    return json(200, out);
  } catch (e) {
    if (e instanceof EmailError) return json(e.status, { error: e.code, message: e.message });
    return json(500, { error: "erro_interno" });
  }
});

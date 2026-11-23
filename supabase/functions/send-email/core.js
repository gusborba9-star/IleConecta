// Envio de e-mail dos avisos importantes (Resend). Núcleo puro: valida, monta e envia; quem chama decide QUANDO enviar.
// Provedor isolado por adaptador (Blueprint §"Provedores isolados"): trocar o Resend não mexe em quem pede o envio.
// Segurança: só aceita chamada interna (chave de serviço); nunca devolve a chave nem o corpo da resposta do provedor.

export class EmailError extends Error {
  constructor(message, code = "email_error", status = 400) {
    super(message);
    this.name = "EmailError";
    this.code = code;
    this.status = status;
  }
}

export const FROM_ADDRESS = "no-reply@ileconecta.com.br";
export const FROM_NAME = "Ilê Conecta";
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,190}\.[a-z]{2,}$/i;
const MAX_SUBJECT = 150;
const MAX_TEXT = 8000;

/** Compara textos em tempo constante (não vaza onde a chave difere). */
export function safeEqual(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Só links do próprio domínio entram no botão do e-mail. */
export function safeLink(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && (u.hostname === "ileconecta.com.br" || u.hostname.endsWith(".ileconecta.com.br")) ? u.toString() : null;
  } catch { return null; }
}

/** Valida o pedido. Corta quebras de linha do assunto (injeção de cabeçalho) e limites de tamanho. */
export function parseRequest(input) {
  if (!input || typeof input !== "object") throw new EmailError("Pedido inválido.", "invalid_request");
  const to = String(input.to ?? "").trim();
  if (!EMAIL_RE.test(to)) throw new EmailError("Destinatário inválido.", "invalid_to");
  const subject = String(input.subject ?? "").replace(/[\r\n]+/g, " ").trim();
  if (subject.length < 3 || subject.length > MAX_SUBJECT) throw new EmailError("Assunto inválido.", "invalid_subject");
  const text = String(input.text ?? "").trim();
  if (text.length < 3 || text.length > MAX_TEXT) throw new EmailError("Texto inválido.", "invalid_text");
  const key = input.idempotency_key == null ? null : String(input.idempotency_key);
  if (key !== null && !/^[A-Za-z0-9:_\-.]{8,120}$/.test(key)) throw new EmailError("Chave de idempotência inválida.", "invalid_key");
  let replyTo = null;
  if (input.reply_to != null && input.reply_to !== "") {
    replyTo = String(input.reply_to).trim();
    if (!EMAIL_RE.test(replyTo)) throw new EmailError("E-mail de resposta inválido.", "invalid_reply_to");
  }
  const link = input.link == null || input.link === "" ? null : safeLink(input.link);
  if (input.link && !link) throw new EmailError("Link fora do domínio da plataforma.", "invalid_link");
  const linkLabel = String(input.link_label ?? "Abrir no Ilê Conecta").replace(/[\r\n]+/g, " ").slice(0, 60);
  return { to, subject, text, key, replyTo, link, linkLabel };
}

/** Monta HTML simples e seguro (tudo escapado) e a versão em texto puro. */
export function render({ subject, text, link, linkLabel }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = link ? `<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="background:#b4532a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block">${escapeHtml(linkLabel)}</a></p>` : "";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f1e9;font-family:Arial,Helvetica,sans-serif;color:#2b2118"><div style="max-width:560px;margin:0 auto;padding:28px 20px"><p style="font-size:13px;letter-spacing:.08em;color:#8a6d2f;margin:0 0 18px">${escapeHtml(FROM_NAME.toUpperCase())}</p><h1 style="font-size:20px;margin:0 0 18px">${escapeHtml(subject)}</h1>${paragraphs}${button}<p style="font-size:12px;color:#7a6c5d;margin-top:28px">Você recebeu este aviso importante por e-mail porque tem uma conta no Ilê Conecta.</p></div></body></html>`;
  return { html, plain: link ? `${text}\n\n${linkLabel}: ${link}` : text };
}

/** Adaptador Resend. fetchImpl injetável para teste; tempo limite para não prender a função. */
export function createResendAdapter({ apiKey, fetchImpl = fetch, timeoutMs = 8000 }) {
  if (!apiKey) throw new EmailError("Provedor de e-mail não configurado.", "not_configured", 503);
  return {
    id: "resend",
    async send({ to, subject, html, plain, replyTo, key }) {
      const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (key) headers["Idempotency-Key"] = key;
      const body = { from: `${FROM_NAME} <${FROM_ADDRESS}>`, to: [to], subject, html, text: plain };
      if (replyTo) body.reply_to = replyTo;
      let res;
      try {
        res = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        throw new EmailError("Não foi possível falar com o provedor de e-mail.", "provider_unreachable", 502);
      }
      if (res.status === 429 || res.status >= 500) throw new EmailError("Provedor de e-mail indisponível agora.", "provider_busy", 502);
      if (!res.ok) throw new EmailError("O provedor recusou o envio.", "provider_rejected", 502);
      const data = await res.json().catch(() => ({}));
      return { id: typeof data?.id === "string" ? data.id : null };
    },
  };
}

/** Caso de uso: valida e envia. `adapter` e `serviceKey` vêm de fora; só chamada com a chave de serviço passa. */
export async function sendEmail({ adapter, serviceKey, authHeader }, input) {
  const sent = String(authHeader ?? "").replace(/^Bearer\s+/i, "");
  if (!serviceKey || !safeEqual(sent, serviceKey)) throw new EmailError("Não autorizado.", "unauthorized", 401);
  const req = parseRequest(input);
  const { html, plain } = render(req);
  const r = await adapter.send({ to: req.to, subject: req.subject, html, plain, replyTo: req.replyTo, key: req.key });
  return { sent: true, provider: adapter.id, id: r.id };
}

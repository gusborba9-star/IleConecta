// Avisos de segurança da conta (23/11/2026): login com bloqueio progressivo, desbloqueio e "Não fui eu" por link,
// e a fila de e-mails de segurança. Núcleo injetável (sem rede). Resposta e tempo iguais para e-mail com ou sem conta.
import { emailKey } from "./engine.js";

export const LOGIN_MIN_MS = 600;
// Sem limite por e-mail de propósito: quem esgotasse o limite do dono o travaria. A trava por conta (bloqueio progressivo) já faz esse papel.
const LIMITS = { loginIp: 60, tokenIp: 20 };
const EMAIL_RE = /^[^\s@<>()",;:\\]{1,64}@[^\s@<>()",;:\\]{1,190}\.[A-Za-z]{2,24}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{32,128}$/;
export const LOGIN_FAIL_MESSAGE = "E-mail ou senha incorretos.";

const clip = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");

export const fmtWhen = (iso) => {
  try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
};

/** Texto de cada aviso: sempre começa dizendo o que houve e logo em seguida "se foi você, não precisa fazer nada". */
export function buildSecurityMail(ev, token, siteUrl) {
  const when = fmtWhen(ev.created_at);
  const report = { url: `${siteUrl}/seguranca/confirmar#a=report&t=${token}`, label: "Não fui eu, falar com o suporte" };
  const pass = { url: `${siteUrl}/recuperar-senha`, label: "Trocar minha senha" };
  const lost = { url: `${siteUrl}/recuperar-acesso`, label: "Não consigo mais entrar na minha conta" };
  const d = ev.detail ?? {};
  const NAO_FOI = "Se não foi você, proteja a sua conta agora: troque a senha e nos avise pelo botão abaixo.";
  switch (ev.kind) {
    case "login_novo_aparelho": return {
      subject: "Novo acesso à sua conta no Ilê Conecta",
      text: `Detectamos um acesso à sua conta em um aparelho novo: ${clip(d.label, 60) || "aparelho"}, em ${when}.\n\nSe foi você, não precisa fazer nada.\n\n${NAO_FOI}`,
      link: report.url, linkLabel: report.label, extra: [pass, lost] };
    case "conta_bloqueada": {
      const rest = d.needs_email ? "até você desbloquear pelo botão abaixo" : `por ${Number(d.minutes) || 15} minutos`;
      return {
        subject: "Sua conta foi bloqueada por excesso de tentativas",
        text: `Houve muitas tentativas de senha errada na sua conta (${when}) e, por segurança, ela foi bloqueada ${rest}.\n\nSe foi você, ${d.needs_email ? "use o botão \"Fui eu, desbloquear\"" : "aguarde o prazo ou use o botão \"Fui eu, desbloquear\""}.\n\nSe não foi você, a sua conta continua protegida: ninguém entrou. Fale com o suporte pelo botão abaixo e, se quiser, troque a senha.`,
        link: `${siteUrl}/seguranca/confirmar#a=unlock&t=${token}`, linkLabel: "Fui eu, desbloquear", extra: [report, pass] };
    }
    case "senha_alterada": return {
      subject: "A senha da sua conta foi alterada",
      text: `A senha da sua conta no Ilê Conecta foi alterada em ${when}.\n\nSe foi você, não precisa fazer nada.\n\nSe não foi você, fale com o suporte agora pelo botão abaixo.`,
      link: report.url, linkLabel: report.label, extra: [lost] };
    case "palavra_alterada": {
      const what = d.action === "delete" ? "removida" : d.action === "insert" ? "criada" : "alterada";
      return {
        subject: "A palavra de segurança da sua conta mudou",
        text: `A palavra de segurança da sua conta foi ${what} em ${when}.\n\nSe foi você, não precisa fazer nada.\n\nSe não foi você, fale com o suporte agora pelo botão abaixo e troque a sua senha.`,
        link: report.url, linkLabel: report.label, extra: [pass] };
    }
    case "recuperacao_pedida": return {
      subject: "Alguém pediu para recuperar o acesso da sua conta",
      text: `Recebemos um pedido de recuperação de acesso para a sua conta no Ilê Conecta (${when}).\n\nSe foi você, não precisa fazer nada: a nossa equipe analisa o pedido com cuidado.\n\nSe não foi você, a sua conta continua protegida: nada muda sem uma análise e sem um prazo de segurança de 24 horas. Avise-nos pelo botão abaixo e, se quiser, troque a senha.`,
      link: report.url, linkLabel: report.label, extra: [pass] };
    case "recuperacao_aprovada": return {
      subject: "Aviso de segurança sobre a sua conta",
      text: `Um pedido de troca do e-mail desta conta foi aprovado pela nossa equipe e está aguardando a confirmação no novo endereço (${when}).\n\nSe foi você, não precisa fazer nada.\n\nSe não foi você, entre agora, troque a senha e fale com o suporte pelo botão abaixo.`,
      link: report.url, linkLabel: report.label, extra: [pass] };
    case "email_alterado": return {
      subject: "O e-mail da sua conta foi alterado",
      text: `O e-mail da sua conta no Ilê Conecta foi alterado em ${when}, depois de uma recuperação de acesso aprovada. Todas as sessões foram encerradas.\n\nSe foi você, não precisa fazer nada.\n\nSe não foi você, fale com o suporte imediatamente pelo botão abaixo.`,
      link: report.url, linkLabel: report.label, extra: [] };
    default: return null;
  }
}

export function createSecurity(deps) {
  const { rpc, sendMail, signIn, sleep, now, randomHex, sha256, siteUrl, log = () => {} } = deps;
  const hit = (bucket, limit) => rpc("recovery_throttle_hit", { p_bucket: bucket, p_limit: limit });
  const pad = async (t0, ms) => { const w = ms - (now() - t0); if (w > 0) await sleep(w); };

  /** Login passando pelo bloqueio. Devolve a sessão só quando a senha confere; nunca diz se a conta existe. */
  async function login(body, ip) {
    const t0 = now();
    const email = clip(body?.email, 254).toLowerCase();
    const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
    const device = typeof body?.device_id === "string" && DEVICE_RE.test(body.device_id) ? body.device_id : null;
    const label = clip(body?.label, 60);
    if (!EMAIL_RE.test(email) || !password) return { status: 400, body: { error: "pedido_invalido" } };
    const key = emailKey(email);
    if (ip && !(await hit(`lg:${ip}`, LIMITS.loginIp))) {
      await pad(t0, LOGIN_MIN_MS);
      return { status: 429, body: { error: "muitas_tentativas" } };
    }
    const dev = device ? await sha256(device) : null;
    const gate = await rpc("sec_login_check", { p_key: key, p_device_hash: dev });
    if (gate?.locked) {
      await pad(t0, LOGIN_MIN_MS);
      return { status: 423, body: { error: "bloqueada", until: gate.until, needs_email: Boolean(gate.needs_email) } };
    }
    const r = await signIn(email, password);
    if (r.ok) {
      try { await rpc("sec_login_ok", { p_user: r.user_id, p_device_hash: dev, p_label: label }); } catch (e) { log("sec_login_ok_erro", String(e?.message ?? e).slice(0, 200)); }
      return { status: 200, body: { ok: true, access_token: r.access_token, refresh_token: r.refresh_token } };
    }
    if (r.error === "nao_confirmado") return { status: 403, body: { error: "nao_confirmado" } };
    if (r.error === "indisponivel") return { status: 503, body: { error: "indisponivel" } };
    const st = await rpc("sec_login_fail", { p_key: key });
    await pad(t0, LOGIN_MIN_MS);
    if (st?.locked) return { status: 423, body: { error: "bloqueada", until: st.until, needs_email: Boolean(st.needs_email) } };
    return { status: 401, body: { error: "credenciais", message: LOGIN_FAIL_MESSAGE } };
  }

  async function tokenAction(body, ip, rpcName) {
    const token = typeof body?.token === "string" ? body.token.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(token)) return { status: 400, body: { error: "link_invalido" } };
    if (ip && !(await hit(`st:${ip}`, LIMITS.tokenIp))) return { status: 429, body: { error: "muitas_tentativas" } };
    const ok = await rpc(rpcName, { p_hash: await sha256(token) });
    return ok ? { status: 200, body: { ok: true } } : { status: 400, body: { error: "link_invalido" } };
  }
  const unlock = (body, ip) => tokenAction(body, ip, "sec_unlock");
  const report = (body, ip) => tokenAction(body, ip, "sec_report");

  /** Envia os avisos de segurança pendentes. Cada um leva um link próprio (vale 7 dias). */
  async function processEvents() {
    const rows = (await rpc("sec_due_events", {})) ?? [];
    let sent = 0;
    for (const ev of rows) {
      try {
        const token = randomHex(32); const h = await sha256(token);
        if (!(await rpc("sec_event_set_token", { p_id: ev.id, p_hash: h }))) continue;
        const m = buildSecurityMail(ev, token, siteUrl);
        if (!m || !ev.email) { await rpc("sec_event_mark_mailed", { p_id: ev.id }); continue; }
        await sendMail({ to: ev.email, subject: m.subject, text: m.text, link: m.link, link_label: m.linkLabel,
          extra_links: m.extra, idempotency_key: `sec-${ev.id}-${h.slice(0, 8)}` });
        await rpc("sec_event_mark_mailed", { p_id: ev.id }); sent++;
      } catch (e) { log("sec_fila_erro", String(e?.message ?? e).slice(0, 200)); }
    }
    return sent;
  }

  /** Comunicados da administração marcados "também por e-mail": só texto e link do próprio site, em lotes. */
  async function processAnnouncements() {
    const rows = (await rpc("ann_due_mails", {})) ?? [];
    let sent = 0;
    for (const r of rows) {
      try {
        if (!r.email) { await rpc("ann_mark_mailed", { p_id: r.id }); continue; }
        const href = typeof r.href === "string" && /^\/[A-Za-z0-9/_?=&#.-]{0,200}$/.test(r.href) ? `${siteUrl}${r.href}` : null;
        await sendMail({ to: r.email, subject: "Aviso do Ilê Conecta", text: clip(r.text, 400), ...(href ? { link: href, link_label: "Abrir no Ilê Conecta" } : {}), idempotency_key: `ann-${r.id}` });
        await rpc("ann_mark_mailed", { p_id: r.id }); sent++;
      } catch (e) { log("ann_fila_erro", String(e?.message ?? e).slice(0, 200)); }
    }
    return sent;
  }

  return { login, unlock, report, processEvents, processAnnouncements };
}

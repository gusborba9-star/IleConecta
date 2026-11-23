// Recuperação de acesso: lógica do servidor (Blueprint §18, 23/11/2026). Tudo injetável para testar sem rede.
// Princípios: resposta e tempo IGUAIS para qualquer entrada válida (não revela se a conta existe); a palavra de segurança
// digitada nunca é gravada; o link de confirmação vai SÓ para o e-mail novo; ninguém (nem o dono) define ou vê senha.
import { DEFAULT_SCORING, emailKey, evaluate, identificationScore } from "./engine.js";

export const MIN_RESPONSE_MS = 1500;
export const UNIFORM_MESSAGE = "Recebemos o seu pedido. Se as informações fizerem sentido, a decisão chega por e-mail em até 24 horas.";
const EMAIL_RE = /^[^\s@<>()",;:\\]{1,64}@[^\s@<>()",;:\\]{1,190}\.[A-Za-z]{2,24}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITS = { ip: 6, email: 3, global: 300, wordPerAccount: 10, confirmIp: 20, infoIp: 20 };

export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

const clip = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YESNO = new Set(["sim", "nao", "nao_lembro", ""]);

/** Aceita só os campos conhecidos, com tamanho limitado. Qualquer outra coisa é descartada. */
export function sanitizeInput(body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "pedido_invalido");
  const contact = clip(body.contact_email, 254).toLowerCase();
  if (!EMAIL_RE.test(contact)) throw new HttpError(400, "email_invalido");
  const c = body.claimed && typeof body.claimed === "object" ? body.claimed : {};
  const type = c.type === "casa" ? "casa" : c.type === "cliente" ? "cliente" : null;
  if (!type) throw new HttpError(400, "tipo_invalido");
  const claimed = { type, name: clip(c.name, 120), old_email: clip(c.old_email, 254), city: clip(c.city, 80) };
  const a = body.answers && typeof body.answers === "object" ? body.answers : {};
  const month = (v) => (typeof v === "string" && MONTH_RE.test(v) ? v : "");
  const yn = (v) => (typeof v === "string" && YESNO.has(v) ? v : "");
  const answers = {
    signup_month: month(a.signup_month), last_access_month: month(a.last_access_month), last_tx_month: month(a.last_tx_month),
    had_tx: yn(a.had_tx), uses_assistant: yn(a.uses_assistant), has_staff: yn(a.has_staff), has_members: yn(a.has_members),
    last_tx_kind: clip(a.last_tx_kind, 40), last_tx_value: clip(String(a.last_tx_value ?? ""), 20), members_count: clip(String(a.members_count ?? ""), 8),
    assistant_name: clip(a.assistant_name, 60), plan: clip(a.plan, 30),
    top_houses: Array.isArray(a.top_houses) ? a.top_houses.slice(0, 3).map((x) => clip(x, 80)).filter(Boolean) : [],
  };
  const round = body.round === 2 ? 2 : 1;
  const parent = round === 2 ? clip(body.parent_id, 40).toLowerCase() : null;
  if (round === 2 && !UUID_RE.test(parent)) throw new HttpError(400, "pedido_invalido");
  return { contact, claimed, answers, word: clip(body.security_word, 80), round, parent, honeypot: clip(body.website, 20) };
}

/** Só números dentro de faixas seguras entram; o resto volta ao padrão. */
export function sanitizeScoring(raw) {
  const d = DEFAULT_SCORING; const out = structuredClone(d);
  if (!raw || typeof raw !== "object") return out;
  const num = (v, lo, hi, fb) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : fb);
  if (raw.weights && typeof raw.weights === "object") for (const k of Object.keys(d.weights)) out.weights[k] = num(raw.weights[k], 0, 100, d.weights[k]);
  if (Array.isArray(raw.strong)) { const ok = raw.strong.filter((k) => k in d.weights); if (ok.length) out.strong = ok; }
  for (const g of ["approve", "second"]) if (raw[g] && typeof raw[g] === "object") {
    out[g].minStrongHits = Math.round(num(raw[g].minStrongHits, 0, 10, d[g].minStrongHits));
    out[g].minRatio = num(raw[g].minRatio, 0, 1, d[g].minRatio);
  }
  out.minAnswered = Math.round(num(raw.minAnswered, 1, 14, d.minAnswered));
  out.candidateMinId = num(raw.candidateMinId, 0, 1, d.candidateMinId);
  out.ambiguityGap = num(raw.ambiguityGap, 0, 1, d.ambiguityGap);
  return out;
}

export function createRecovery(deps) {
  const { rpc, sendMail, adminUpdateEmail, sleep, now, randomHex, sha256, cronOk, siteUrl, log = () => {} } = deps;
  const rpcOk = async (fn, args) => { const r = await rpc(fn, args); return r; };

  async function doSubmit(inp, ip) {
    if (inp.honeypot) return;
    const key = emailKey(inp.contact);
    const okIp = ip ? await rpcOk("recovery_throttle_hit", { p_bucket: `ip:${ip}`, p_limit: LIMITS.ip }) : true;
    const okEm = await rpcOk("recovery_throttle_hit", { p_bucket: `em:${key}`, p_limit: LIMITS.email });
    const okAll = await rpcOk("recovery_throttle_hit", { p_bucket: "all", p_limit: LIMITS.global });
    if (!okIp || !okEm || !okAll) return;
    if (await rpcOk("recovery_blocked", { p_contact_key: key })) return;
    if (inp.round === 2 && !(await rpcOk("recovery_use_parent", { p_parent: inp.parent, p_key: key }))) return;

    const scoring = sanitizeScoring(await rpcOk("recovery_scoring_get", {}));
    const facts = await rpcOk("recovery_candidate_facts", { p_type: inp.claimed.type, p_name: inp.claimed.name, p_email_key: emailKey(inp.claimed.old_email), p_city: inp.claimed.city });
    const list = (Array.isArray(facts) ? facts : [])
      .map((f) => ({ f, s: identificationScore(inp.claimed, f) }))
      .filter((x) => x.s >= scoring.candidateMinId).sort((a, b) => b.s - a.s).slice(0, 5);

    const candidates = [];
    for (const { f } of list) {
      let wordState = "not_answered";
      if (inp.word) {
        // Limite de tentativas por conta: quem chuta a palavra não consegue testar em massa.
        const allowed = await rpcOk("recovery_throttle_hit", { p_bucket: `tw:${f.user_id}`, p_limit: LIMITS.wordPerAccount });
        if (allowed) wordState = await rpcOk("check_security_word", { p_user: f.user_id, p_word: inp.word });
      } else wordState = await rpcOk("check_security_word", { p_user: f.user_id, p_word: "" });
      candidates.push({ facts: f, wordState });
    }
    const ev = evaluate({ claimed: inp.claimed, answers: inp.answers, round: inp.round }, candidates, scoring);
    const top = ev.candidates[0];
    const bestWord = top ? candidates.find((c) => c.facts.user_id === top.user_id)?.wordState : null;
    const id = await rpcOk("recovery_submit", {
      p_ip: ip || null, p_contact_email: inp.contact, p_claimed: inp.claimed, p_answers: inp.answers, p_round: inp.round, p_parent: inp.parent,
      p_candidate: ev.lane === "normal" && top ? top.user_id : null, p_candidates: ev.candidates, p_word_checked: bestWord === "ok" || bestWord === "wrong" ? true : bestWord ? false : null,
      p_evaluation: ev, p_recommendation: ev.recommendation, p_lane: ev.lane,
    });
    if (ev.lane === "normal" && top) {
      const ownerMail = await rpcOk("recovery_claim_owner_notice", { p_request: id });
      if (ownerMail) await sendMail({
        to: ownerMail, subject: "Alguém pediu para recuperar o acesso da sua conta",
        text: "Recebemos um pedido de recuperação de acesso para a sua conta no Ilê Conecta.\n\nSe foi você, não precisa fazer nada: a nossa equipe analisa o pedido com cuidado.\nSe NÃO foi você, a sua conta continua protegida: nada muda sem uma análise e sem um prazo de segurança de 24 horas. Se quiser, entre agora e troque a sua senha.",
        idempotency_key: `rec-dono-${id}`, link: siteUrl, link_label: "Entrar no Ilê Conecta",
      });
    }
  }

  async function submit(body, ip) {
    const inp = sanitizeInput(body);
    const t0 = now();
    try { await doSubmit(inp, ip); } catch (e) { log("recovery_submit_erro", String(e?.message ?? e).slice(0, 200)); }
    const wait = MIN_RESPONSE_MS - (now() - t0);
    if (wait > 0) await sleep(wait);
    return { status: 200, body: { ok: true, message: UNIFORM_MESSAGE } };
  }

  const DECISION_MAIL = {
    aprovado: { subject: "Seu pedido de recuperação foi aprovado", text: "Boa notícia: o seu pedido de recuperação de acesso foi aprovado.\n\nPor segurança, existe um prazo de 24 horas. Depois dele, enviaremos para ESTE e-mail um link de confirmação. Só quem recebe o link neste endereço consegue concluir a troca.\n\nSe você não fez este pedido, ignore esta mensagem." },
    recusado: { subject: "Sobre o seu pedido de recuperação de acesso", text: "Não conseguimos confirmar com segurança que esta conta é sua, então o pedido não foi aprovado.\n\nVocê pode tentar novamente depois de 7 dias, com o máximo de informações que lembrar. Se você não fez este pedido, ignore esta mensagem." },
  };

  async function processQueue(secret) {
    if (typeof secret !== "string" || secret.length < 20 || secret.length > 200 || !(await cronOk(secret))) throw new HttpError(401, "nao_autorizado");
    const rows = (await rpcOk("recovery_due_mails", {})) ?? [];
    let sent = 0;
    for (const r of rows.slice(0, 20)) {
      try {
        if (r.kind === "decisao") {
          if (r.decision === "segunda_rodada") {
            await sendMail({ to: r.contact_email, subject: "Precisamos de mais algumas informações", idempotency_key: `rec-dec-${r.id}`,
              text: "Quase lá. Para confirmar com segurança que a conta é sua, precisamos de mais algumas informações.\n\nNo botão abaixo, as respostas que você já deu aparecem preenchidas e as que ficaram em branco vêm destacadas. Tente lembrar de: a última compra ou pagamento (tipo, valor e mês), quando você criou a conta e entrou pela última vez, com quem você mais conversou e outros e-mails que já usou.\n\nO botão vale uma única vez.",
              link: `${siteUrl}/recuperar-acesso#r=${r.id}`, link_label: "Responder mais perguntas" });
          } else {
            const m = DECISION_MAIL[r.decision]; if (!m) continue;
            await sendMail({ to: r.contact_email, subject: m.subject, text: m.text, idempotency_key: `rec-dec-${r.id}` });
          }
          await rpcOk("recovery_mark_mail", { p_id: r.id, p_kind: "decisao" }); sent++;
        } else if (r.kind === "confirmacao") {
          const token = randomHex(32); const h = await sha256(token);
          if (!(await rpcOk("recovery_issue_confirm", { p_id: r.id, p_hash: h }))) continue;
          await sendMail({ to: r.contact_email, subject: "Confirme o novo e-mail da sua conta", idempotency_key: `rec-conf-${r.id}-${h.slice(0, 8)}`,
            text: "Passou o prazo de segurança. Para concluir a recuperação, confirme este e-mail no botão abaixo. O link vale por 7 dias e só funciona uma vez.\n\nDepois de confirmar, você cria uma nova senha. Ninguém da nossa equipe vê ou define a sua senha.",
            link: `${siteUrl}/recuperar-acesso/confirmar#t=${token}`, link_label: "Confirmar novo e-mail" });
          const old = await rpcOk("recovery_account_email", { p_user: r.decision_account });
          if (old) await sendMail({ to: old, subject: "Aviso de segurança sobre a sua conta", idempotency_key: `rec-aviso-${r.id}`,
            text: "Um pedido de troca do e-mail desta conta foi aprovado pela nossa equipe e está aguardando a confirmação no novo endereço.\n\nSe NÃO foi você, entre agora e troque a sua senha, e fale com o suporte." });
          await rpcOk("recovery_mark_mail", { p_id: r.id, p_kind: "confirmacao" }); sent++;
        }
      } catch (e) { log("recovery_fila_erro", String(e?.message ?? e).slice(0, 200)); }
    }
    return { status: 200, body: { ok: true, processed: sent } };
  }

  async function confirm(body, ip) {
    const token = typeof body?.token === "string" ? body.token.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, "link_invalido");
    if (ip && !(await rpcOk("recovery_throttle_hit", { p_bucket: `cf:${ip}`, p_limit: LIMITS.confirmIp }))) throw new HttpError(429, "muitas_tentativas");
    const rows = (await rpcOk("recovery_confirm_lookup", { p_hash: await sha256(token) })) ?? [];
    const r = rows[0];
    if (!r) throw new HttpError(400, "link_invalido");
    const old = await rpcOk("recovery_account_email", { p_user: r.user_id });
    try { await adminUpdateEmail(r.user_id, r.new_email); } catch { throw new HttpError(409, "nao_foi_possivel"); }
    await rpcOk("recovery_burn_token", { p_id: r.id });
    if (old) { try { await sendMail({ to: old, subject: "O e-mail da sua conta foi alterado", idempotency_key: `rec-feito-${r.id}`,
      text: "O e-mail da sua conta no Ilê Conecta foi alterado depois de uma recuperação de acesso aprovada. Todas as sessões foram encerradas.\n\nSe NÃO foi você, fale com o suporte imediatamente." }); } catch { /* aviso é bônus */ } }
    return { status: 200, body: { ok: true, email: r.new_email } };
  }

  /** Segunda rodada: devolve à pessoa o que ela mesma informou antes (para preencher só o que faltou). Exige código do pedido + mesmo e-mail. */
  async function round2Info(body, ip) {
    const parent = typeof body?.parent_id === "string" ? body.parent_id.trim().toLowerCase() : "";
    const contact = clip(body?.contact_email, 254).toLowerCase();
    if (!UUID_RE.test(parent) || !EMAIL_RE.test(contact)) throw new HttpError(400, "pedido_invalido");
    if (ip && !(await rpcOk("recovery_throttle_hit", { p_bucket: `in:${ip}`, p_limit: LIMITS.infoIp }))) throw new HttpError(429, "muitas_tentativas");
    const info = await rpcOk("recovery_parent_info", { p_parent: parent, p_key: emailKey(contact) });
    if (!info) throw new HttpError(400, "pedido_invalido");
    return { status: 200, body: { ok: true, claimed: info.claimed ?? {}, answers: info.answers ?? {} } };
  }

  async function handle({ method, headers, body, ip }) {
    if (method !== "POST") return { status: 405, body: { error: "metodo_nao_permitido" } };
    try {
      const action = body && typeof body === "object" ? body.action : null;
      if (action === "process_queue") return await processQueue(headers.get("x-recovery-secret"));
      if (action === "confirm") return await confirm(body, ip);
      if (action === "submit") return await submit(body, ip);
      if (action === "round2_info") return await round2Info(body, ip);
      return { status: 400, body: { error: "acao_invalida" } };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
      log("recovery_erro", String(e?.message ?? e).slice(0, 200));
      return { status: 500, body: { error: "erro_interno" } };
    }
  }

  return { handle, submit, processQueue, confirm, round2Info };
}

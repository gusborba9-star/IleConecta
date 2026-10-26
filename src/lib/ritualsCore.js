// Regras puras dos rituais (eventos coletivos), sem rede, testáveis em Node.
import { parsePriceToCents } from "./servicesCore.js";

export const RITUAL_MODES = [
  { id: "presencial", label: "Presencial", hint: "Os participantes vão até a casa." },
  { id: "distancia", label: "Transmissão", hint: "À distância; o link só aparece para quem tem vaga." },
  { id: "hibrido", label: "Presencial e transmissão", hint: "Parte no local, parte à distância." },
  { id: "sigilo", label: "Sigilo", hint: "A casa realiza com discrição e avisa os participantes." },
];

/** Dados que a casa pode pedir ao participante (LGPD: peça só o necessário). */
export const FIELD_PRESETS = [
  { id: "nome_completo", label: "Nome completo" },
  { id: "intencao", label: "Intenção do ritual" },
  { id: "data_nascimento", label: "Data de nascimento" },
  { id: "pedido", label: "Pedido ou motivo" },
  { id: "whatsapp", label: "WhatsApp para contato" },
];

export const MAX_FIELDS = 8;
export const MAX_SEATS = 5000;

export function modeLabel(mode) {
  return RITUAL_MODES.find((m) => m.id === mode)?.label ?? "Presencial";
}

/** Vagas restantes (nunca negativo). */
export function seatsLeft(total, taken) {
  return Math.max(0, Number(total) - Number(taken));
}

export function seatsState(total, taken) {
  const left = seatsLeft(total, taken);
  if (left === 0) return "esgotado";
  return left <= Math.max(3, Math.ceil(Number(total) * 0.1)) ? "ultimas" : "abertas";
}

/** Receita bruta de vagas ocupadas, em centavos. (A taxa só entra quando houver pagamento na plataforma.) */
export function grossCents(priceCents, taken) {
  return Number(priceCents) * Number(taken);
}

/** "2026-11-14" + "19:30" no fuso de Brasília (UTC-3, sem horário de verão) → ISO UTC; null se inválido. */
export function toStartsAtIso(dateText, timeText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText ?? "") || !/^\d{2}:\d{2}$/.test(timeText ?? "")) return null;
  const d = new Date(`${dateText}T${timeText}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO UTC → { date, time } no fuso de Brasília, para preencher o formulário. */
export function fromIsoToBrt(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return { date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

/** Normaliza a lista de campos: rótulo 2..60, id único, no máximo 8. */
export function normalizeFields(fields) {
  const out = [];
  const used = new Set();
  for (const f of Array.isArray(fields) ? fields : []) {
    const label = String(f?.label ?? "").trim().slice(0, 60);
    if (label.length < 2) continue;
    let id = slug(String(f?.id ?? "")) || slug(label) || "campo";
    let n = 2;
    const base = id;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    out.push({ id, label, required: Boolean(f?.required) });
    if (out.length === MAX_FIELDS) break;
  }
  return out;
}

/** Valida o formulário do ritual; devolve erros por campo e o valor pronto para gravar. */
export function validateRitual(input, now = new Date()) {
  const errors = {};
  const title = String(input?.title ?? "").trim();
  if (title.length < 2) errors.title = "Informe o nome do ritual.";
  if (title.length > 100) errors.title = "Use até 100 letras.";

  const description = String(input?.description ?? "").trim();
  if (description.length > 1500) errors.description = "Use até 1.500 letras.";

  const priceCents = parsePriceToCents(String(input?.priceText ?? ""));
  if (priceCents === null) errors.price = "Informe um valor válido, por exemplo 199,00.";

  const seats = Number(String(input?.seatsText ?? "").trim());
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) errors.seats = `Informe de 1 a ${MAX_SEATS} vagas.`;

  const mode = RITUAL_MODES.some((m) => m.id === input?.mode) ? input.mode : null;
  if (!mode) errors.mode = "Escolha como o ritual é realizado.";

  const startsAt = toStartsAtIso(input?.date, input?.time);
  if (!startsAt) errors.when = "Informe a data e a hora.";
  else if (!input?.allowPast && new Date(startsAt) <= now) errors.when = "A data precisa ser no futuro.";

  const streamUrl = String(input?.streamUrl ?? "").trim();
  if (streamUrl && !/^https:\/\/[^\s]+$/i.test(streamUrl)) errors.streamUrl = "Use um link que comece com https://";
  if (streamUrl.length > 500) errors.streamUrl = "Link muito longo.";

  const fields = normalizeFields(input?.fields);

  if (Object.keys(errors).length > 0) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors,
    value: {
      title,
      description: description || null,
      price_cents: priceCents,
      seats_total: seats,
      mode,
      starts_at: startsAt,
      intake_fields: fields,
      stream_url: streamUrl || null,
    },
  };
}

/** Confere as respostas do participante contra os campos do ritual. */
export function validateAnswers(fields, answers) {
  const errors = {};
  const clean = {};
  for (const f of normalizeFields(fields).length ? fields : []) {
    const v = String(answers?.[f.id] ?? "").trim();
    if (f.required && !v) errors[f.id] = "Campo obrigatório.";
    else if (v.length > 500) errors[f.id] = "Use até 500 letras.";
    clean[f.id] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors, value: null } : { ok: true, errors, value: clean };
}

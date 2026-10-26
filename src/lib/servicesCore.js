// Regras puras do catálogo de serviços da casa (sem rede), testáveis em Node.

export const SERVICE_KINDS = [
  { id: "trabalho", label: "Trabalho" },
  { id: "buzios", label: "Jogo de búzios" },
  { id: "cartas", label: "Cartas" },
  { id: "consulta", label: "Consulta" },
  { id: "limpeza", label: "Limpeza espiritual" },
  { id: "outro", label: "Outro" },
];

export const SERVICE_DELIVERIES = [
  { id: "presencial", label: "Presencial", hint: "O cliente vai até a casa." },
  { id: "transmissao", label: "Transmissão", hint: "À distância, por vídeo ou chamada." },
  { id: "sigilo", label: "Sigilo", hint: "A casa realiza com discrição e avisa o cliente." },
];

export const MAX_PRICE_CENTS = 10_000_000; // R$ 100.000,00

/** "200", "200,00", "1.200,50", "R$ 199,90" → centavos inteiros; null se inválido. */
export function parsePriceToCents(text) {
  if (typeof text !== "string") return null;
  let s = text.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s || !/^[0-9.,]+$/.test(s)) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    if (s.lastIndexOf(",") < s.lastIndexOf(".")) return null; // 1,200.50 (formato não aceito)
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    if (s.split(",").length > 2) return null;
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    // Um ponto com 3 dígitos depois é milhar ("1.200"); com 1 ou 2 é decimal ("12.5").
    s = parts.length === 2 && last.length <= 2 ? s : s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) && cents > 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}

export function formatCents(cents) {
  return (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function kindLabel(kind, customKind) {
  if (kind === "outro" && typeof customKind === "string" && customKind.trim()) return customKind.trim();
  return SERVICE_KINDS.find((k) => k.id === kind)?.label ?? "Serviço";
}

export function deliveryLabel(delivery) {
  return SERVICE_DELIVERIES.find((d) => d.id === delivery)?.label ?? "Presencial";
}

/** Valida o formulário; devolve os erros por campo e o valor pronto para gravar. */
export function validateService(input) {
  const errors = {};
  const kind = SERVICE_KINDS.some((k) => k.id === input?.kind) ? input.kind : null;
  if (!kind) errors.kind = "Escolha o tipo de serviço.";

  const customKind = String(input?.customKind ?? "").trim();
  if (kind === "outro" && customKind.length < 2) errors.customKind = "Dê um nome ao serviço (mín. 2 letras).";
  if (customKind.length > 40) errors.customKind = "Use até 40 letras.";

  const title = String(input?.title ?? "").trim();
  if (title.length < 2) errors.title = "Informe o nome do serviço.";
  if (title.length > 100) errors.title = "Use até 100 letras.";

  const description = String(input?.description ?? "").trim();
  if (description.length > 600) errors.description = "Use até 600 letras.";

  const priceCents = parsePriceToCents(String(input?.priceText ?? ""));
  if (priceCents === null) errors.price = "Informe um valor válido, por exemplo 200,00.";

  const delivery = SERVICE_DELIVERIES.some((d) => d.id === input?.delivery) ? input.delivery : null;
  if (!delivery) errors.delivery = "Escolha como o serviço é realizado.";

  if (Object.keys(errors).length > 0) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors,
    value: {
      kind,
      custom_kind: kind === "outro" ? customKind : null,
      title,
      description: description || null,
      price_cents: priceCents,
      delivery,
    },
  };
}

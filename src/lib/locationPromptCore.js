// Cartão "Em qual cidade você está?": opcional, nunca bloqueia, volta a cada 3 dias no Início e sempre que o contexto pede. Sem React: testável.
export const COOLDOWN_DAYS = 3;
const DAY = 86_400_000;

const filled = (s) => typeof s === "string" && s.trim() !== "";
/** Falta cidade ou estado no perfil? (o destaque de cidade exige os dois; o de estado, o estado) */
export const missingLocation = (u) => !u || !filled(u.city) || !filled(u.state);

/**
 * context: "home" (Início e telas de lista: respeita o intervalo depois do "Agora não") ou "inline" (a pessoa tocou em algo
 * que depende da cidade: aparece sempre, sem intervalo). dismissedAt: ms da última vez que escolheu "Agora não" (ou null).
 */
export function shouldShowLocationPrompt({ user, dismissedAt = null, context = "home", now = Date.now() }) {
  if (!missingLocation(user)) return false;
  if (context === "inline") return true;
  if (!Number.isFinite(dismissedAt) || dismissedAt === null) return true;
  return now - dismissedAt >= COOLDOWN_DAYS * DAY;
}

/** Cidade limpa: espaços repetidos viram um, no máximo 80 letras. Vazia continua vazia. */
export const cleanCity = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

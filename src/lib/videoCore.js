// Regras puras das reuniões por vídeo (sem rede): textos de recusa, janela de entrada, conferência do agendamento, banco de minutos
// e a conferência do endereço da sala antes de ela ir para dentro de um iframe. O banco repete as regras; aqui é para a tela responder já.

export const KINDS = { reuniao: "Reunião com membros", consulta: "Consulta por vídeo" };
export const VIDEO_STATES = ["off", "beta", "on"];
export const VIDEO_PROVIDERS = ["daily"];
export const VIDEO_STATE_LABEL = { off: "Desligado", beta: "Só casas de teste", on: "Ligado para todas" };
export const PROVIDER_LABEL = { daily: "Daily" };

const REASONS = {
  sem_login: "Entre na sua conta para participar.",
  indisponivel: "Esta reunião não está mais disponível.",
  sem_acesso: "Você não faz parte desta reunião.",
  desligado: "O vídeo ainda não está liberado para esta casa.",
  encerrada: "Esta reunião já terminou.",
  sem_minutos: "Os minutos de vídeo da casa neste mês acabaram.",
  lotada: "A sala está cheia.",
  provedor_indisponivel: "O serviço de vídeo não respondeu. Tente de novo em instantes.",
  medicao_indisponivel: "O vídeo ainda não está pronto: falta ligar a medição dos minutos. Fale com o suporte.",
  pedido_invalido: "Endereço de reunião inválido.",
};

export function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short", timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${date} às ${time}`;
}

/** Mensagem pronta para a pessoa quando o servidor recusa a entrada. */
export function joinReasonText(reason, startsAt) {
  if (reason === "cedo") return startsAt ? `A sala abre 10 minutos antes: ${formatWhen(startsAt)}.` : "Ainda não é hora: a sala abre 10 minutos antes.";
  return REASONS[reason] ?? "Não foi possível entrar agora.";
}

/** 'cedo' (mais de 10 min antes), 'aberta' (de 10 min antes até 10 min depois do fim) ou 'encerrada'. */
export function meetingPhase(m, nowMs = Date.now()) {
  const start = Date.parse(m.starts_at ?? m.startsAt);
  const dur = Number(m.duration_min ?? m.durationMin);
  if (!Number.isFinite(start) || !Number.isFinite(dur)) return "encerrada";
  if (nowMs < start - 10 * 60_000) return "cedo";
  if (nowMs > start + (dur + 10) * 60_000) return "encerrada";
  return "aberta";
}

/** Banco do mês para a tela: percentual usado e nível (ok, aviso a partir de 80%, esgotado). */
export function bankView(b) {
  const cap = Math.max(0, Number(b?.cap) || 0), used = Math.max(0, Number(b?.used) || 0);
  const remaining = Math.max(0, Number.isFinite(Number(b?.remaining)) ? Number(b.remaining) : cap - used);
  const pct = cap === 0 ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const level = cap === 0 || remaining <= 0 ? "out" : pct >= 80 ? "warn" : "ok";
  return { cap, used, remaining, pct, level };
}

/** Data (aaaa-mm-dd) e hora (hh:mm) digitadas no fuso do aparelho → instante ISO, ou null. */
export function localToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^\d{2}:\d{2}$/.test(time ?? "")) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Mesmas regras do banco (video_schedule). Devolve a mensagem de erro ou null. */
export function validateSchedule({ kind, title, startsAtIso, duration, max, orderId }, nowMs = Date.now()) {
  if (kind !== "reuniao" && kind !== "consulta") return "Escolha o tipo.";
  const t = String(title ?? "").trim();
  if (t.length < 1 || t.length > 80) return "Dê um título de até 80 letras.";
  const dur = Number(duration);
  if (!Number.isInteger(dur) || dur < 5 || dur > 90) return "A duração vai de 5 a 90 minutos.";
  const at = Date.parse(startsAtIso ?? "");
  if (!Number.isFinite(at)) return "Escolha o dia e a hora.";
  if (at < nowMs - 5 * 60_000 || at > nowMs + 120 * 86_400_000) return "Escolha um horário a partir de agora e em até 120 dias.";
  if (kind === "consulta") return orderId ? null : "Escolha o pedido do cliente para a consulta.";
  const m = Number(max);
  if (!Number.isInteger(m) || m < 2 || m > 100) return "A reunião comporta de 2 a 100 pessoas.";
  return null;
}

/** Só endereços https do provedor entram no iframe; qualquer outra coisa é recusada. */
export function embedUrl(provider, url, token) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const okHost = provider === "daily" ? host.endsWith(".daily.co") : false;
    if (u.protocol !== "https:" || !okHost) return null;
    if (provider === "daily") {
      if (!token || typeof token !== "string") return null;
      u.searchParams.set("t", token);
    }
    return u.toString().replace("embed=", "embed");
  } catch { return null; }
}

/** Configuração do vídeo (platform_settings.video) em formato seguro para o painel. */
export function readVideoConfig(raw) {
  const v = raw && typeof raw === "object" ? raw : {};
  const state = VIDEO_STATES.includes(v.state) ? v.state : "off";
  const provider = VIDEO_PROVIDERS.includes(v.provider) ? v.provider : "daily";
  const ids = Array.isArray(v.beta_houses) ? v.beta_houses.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];
  return { state, provider, beta_houses: [...new Set(ids)] };
}

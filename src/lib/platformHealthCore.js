// Saúde da plataforma (painel do dono): leitura defensiva da resposta do banco e leitura do estado geral. Sem rede (testável).

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

export const KIND_LABELS = { erro_app: "Erros no app", ia_falha: "Falhas da IA", funcao_erro: "Erros em funções do servidor" };

export function readHealth(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const counts = (o) => ({ erro_app: num(o?.erro_app), ia_falha: num(o?.ia_falha), funcao_erro: num(o?.funcao_erro) });
  const cron = (Array.isArray(r.cron) ? r.cron : []).slice(0, 100).map((c) => ({
    name: txt(c?.name, 80), schedule: txt(c?.schedule, 40), active: c?.active !== false,
    lastRun: iso(c?.last_run), lastStatus: txt(c?.last_status, 40) || null, runs24: num(c?.runs_24h), failed24: num(c?.failed_24h), failed30: num(c?.failed_30min),
  }));
  return {
    generatedAt: iso(r.generated_at),
    lastHour: counts(r.last_hour),
    last24h: counts(r.last_24h),
    top: (Array.isArray(r.top) ? r.top : []).slice(0, 8).map((t) => ({
      kind: txt(t?.kind, 20), source: txt(t?.source, 60), route: txt(t?.route, 120) || null, detail: txt(t?.detail), n: num(t?.n), firstAt: iso(t?.first_at), lastAt: iso(t?.last_at),
    })),
    cron,
    db: { sizeBytes: num(r.db?.size_bytes), connections: num(r.db?.connections) },
    alerts: (Array.isArray(r.alerts) ? r.alerts : []).slice(0, 50).map((a) => ({ code: txt(a?.code, 120), since: iso(a?.since) })),
  };
}

/** "ok" quando nada exige atenção; "atencao" quando há alerta aberto, rotina falhando ou erros na última hora. */
export function overallStatus(h) {
  const falhando = h.cron.some((c) => c.failed30 > 0);
  const erros1h = h.lastHour.erro_app + h.lastHour.ia_falha + h.lastHour.funcao_erro;
  if (h.alerts.length > 0 || falhando) return "atencao";
  return erros1h > 0 ? "observar" : "ok";
}

export const STATUS_TEXT = { ok: "Tudo certo", observar: "Houve erros na última hora", atencao: "Precisa de atenção" };

/** Situação de uma rotina: falhando, sem rodar (as frequentes), desligada, ou ok. */
export function cronState(c, now = Date.now()) {
  if (!c.active) return "desligada";
  if (c.failed30 > 0) return "falhando";
  const frequente = /^(\*|\*\/\d+|\d+) (\*|\*\/\d+) \* \* \*$/.test(c.schedule);
  if (frequente && c.lastRun && now - Date.parse(c.lastRun) > 2 * 3600_000) return "parada";
  if (!c.lastRun) return "ainda_nao_rodou";
  return c.failed24 > 0 ? "falhou_antes" : "ok";
}

export const CRON_STATE_TEXT = { ok: "ok", falhando: "falhando agora", parada: "parada", desligada: "desligada", ainda_nao_rodou: "ainda não rodou", falhou_antes: "falhou nas últimas 24 h" };

export function ago(isoStr, now = Date.now()) {
  const t = Date.parse(isoStr ?? "");
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "agora há pouco";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} dia(s)`;
}

export const megabytes = (b) => `${(num(b) / 1048576).toFixed(0)} MB`;

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
    lastRun: iso(c?.last_run), lastStatus: txt(c?.last_status, 40) || null, runs24: num(c?.runs_24h), failed24: num(c?.failed_24h), failed30: num(c?.failed_30min), canRun: c?.can_run === true,
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
    alerts: (Array.isArray(r.alerts) ? r.alerts : []).slice(0, 50).map((a) => ({ code: txt(a?.code, 120), since: iso(a?.since), seenAt: iso(a?.seen_at) })),
    maintenance: { assistant: r.maintenance?.assistant === true, payments: r.maintenance?.payments === true, since: iso(r.maintenance?.since) },
    manualRuns: (Array.isArray(r.manual_runs) ? r.manual_runs : []).slice(0, 5).map((m) => ({ routine: txt(m?.routine, 80), at: iso(m?.at), ok: m?.ok === true, note: txt(m?.note, 200) || null })),
  };
}

/** "ok" quando nada exige atenção; "atencao" quando há alerta aberto, rotina falhando ou erros na última hora. */
export function overallStatus(h) {
  const falhando = h.cron.some((c) => c.failed30 > 0);
  const erros1h = h.lastHour.erro_app + h.lastHour.ia_falha + h.lastHour.funcao_erro;
  if (h.alerts.length > 0 || falhando || h.maintenance.assistant || h.maintenance.payments) return "atencao";
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

/** O que cada rotina agendada faz, em português simples (o painel mostra logo abaixo do nome). */
export const CRON_DESCRIPTIONS = {
  "expire-stale-holds": "Libera as vagas reservadas que não foram pagas a tempo, para outra pessoa poder comprar.",
  "handoff-remind": "Lembra a casa de responder quando a assistente passou uma conversa para o atendimento humano e o cliente está esperando.",
  "health-check": "Confere esta própria tela (erros, rotinas e banco) e avisa você no sino quando algo quebra.",
  "member-dues-daily": "Gera e confere as mensalidades dos membros das casas que vencem no dia.",
  "plan-trial-revert": "Devolve a casa ao plano anterior quando acaba o período de teste de um plano.",
  "platform-billing-sweep": "Confere com a Stripe as cobranças dos planos das casas, para pegar qualquer pagamento que tenha escapado.",
  "platform-billing-tick": "Emite as faturas dos planos das casas, marca as vencidas, avisa e recalcula suspensões.",
  "platform-cancel-apply": "Aplica os cancelamentos de plano agendados cuja data chegou.",
  "platform-price-apply": "Aplica as mudanças de preço de plano agendadas cuja data chegou.",
  "promotions-tick": "Liga, avisa e encerra os destaques e impulsionamentos conforme início e fim.",
  "purge-access-logs": "Limpeza de privacidade: apaga os registros de acesso antigos, conforme a política de retenção.",
  "purge-conecta-calls": "Limpeza de privacidade: apaga o registro de uso da assistente Conecta depois do prazo.",
  "purge-deleted-identities": "Limpeza de privacidade: apaga de vez os dados de identidade de contas excluídas depois do prazo.",
  "purge-expired-files": "Limpeza: apaga do armazenamento os arquivos que já passaram do prazo de guarda.",
  "purge-moment-interactions": "Limpeza de privacidade: apaga curtidas, comentários e visualizações dos momentos 48 horas depois que eles expiram.",
  "purge-moment-publish-log": "Limpeza: apaga o registro de publicações de momentos (usado só para o limite do dia) com mais de 3 dias.",
  "purge-handoff-events": "Limpeza de privacidade: apaga o histórico de passagens para atendimento humano com mais de 12 meses.",
  "purge-live-pings": "Limpeza: apaga os sinais de presença das lives com mais de 30 dias.",
  "purge-message-archive": "Limpeza de privacidade: apaga o arquivo de mensagens cujo prazo de guarda terminou.",
  "purge-staff-audit": "Limpeza de privacidade: apaga o registro de ações da equipe cujo prazo de guarda terminou.",
  "purge-promo-conversions": "Limpeza de privacidade: apaga as conversões atribuídas a anúncios com mais de 13 meses (guarda só anúncio e referência, sem a pessoa).",
  "video-close-stale": "Vídeo: a cada 15 minutos fecha as sessões sem saída registrada (contando só até o fim previsto da reunião) e encerra reuniões esquecidas.",
  "purge-video-usage": "Limpeza de privacidade: apaga o consumo de vídeo (quem entrou e quando) com mais de 12 meses.",
  "purge-music-license-log": "Limpeza de privacidade: apaga do registro de faixas retiradas o que já passou dos 5 anos de guarda.",
  "purge-support-cases": "Limpeza de privacidade: apaga os chamados de suporte encerrados depois do prazo.",
  "recovery-purge": "Limpeza: apaga e-mails vinculados vencidos, contadores de limite e pedidos de recuperação de acesso com mais de 24 meses.",
  "recovery-expire": "Fecha pedidos de recuperação de acesso sem decisão há 30 dias e links de confirmação não usados em 7 dias.",
  "recovery-queue": "Envia os e-mails da recuperação de acesso (decisão depois do prazo de 24 horas e link de confirmação só para o e-mail novo).",
  "purge-system-events": "Limpeza: apaga os erros registrados nesta tela depois de 30 dias e o histórico antigo das rotinas.",
  "refund-sweep": "Confere e conclui os reembolsos pendentes com a Stripe.",
  "run-account-deletions": "Executa as exclusões de conta que as pessoas pediram, quando o prazo chega.",
};

export const cronDescription = (name) => CRON_DESCRIPTIONS[name] ?? "";

const pad = (n) => String(n).padStart(2, "0");

/** "Quando roda", em português, a partir da expressão do pg_cron (UTC). Horário mostrado em Brasília (UTC-3). */
export function cronWhen(schedule) {
  const m = /^(\*|\*\/(\d+)|(\d+)) (\*|\*\/(\d+)|(\d+)) \* \* \*$/.exec(String(schedule ?? "").trim());
  if (!m) return "";
  const [, minRaw, minStep, minFix, hourRaw, hourStep, hourFix] = m;
  if (minRaw === "*" && hourRaw === "*") return "a cada minuto";
  if (minStep && hourRaw === "*") return `a cada ${minStep} minutos`;
  if (minFix !== undefined && hourRaw === "*") return Number(minFix) === 0 ? "de hora em hora" : `de hora em hora (no minuto ${Number(minFix)})`;
  if (minFix !== undefined && hourFix !== undefined) {
    const h = (Number(hourFix) + 21) % 24;
    return `todo dia às ${pad(h)}:${pad(Number(minFix))} (Brasília)`;
  }
  return "";
}

/** Orientação em português para cada tipo de problema: quem resolve e o que fazer. who: "claude" (me chame), "voce" (ação sua), "ambos" (você confere, depois me chama). */
export function describeAlert(code) {
  const [tipo, alvo = ""] = String(code ?? "").split(":");
  if (tipo === "manutencao_ligada") return { title: "A manutenção está ligada há mais de 1 hora", who: "voce", routine: null, steps: [
    "Se o problema já foi resolvido, desligue as chaves em “Interruptor de emergência” (logo abaixo desta tela).",
    "Se ainda não foi resolvido, me chame: enquanto estiver ligada, os usuários veem o aviso de manutenção." ] };
  if (tipo === "cron_falhou") return { title: `A rotina "${alvo}" falhou`, who: "ambos", routine: alvo, steps: [
    "Toque em “Rodar agora” nessa rotina (na lista abaixo). Se foi oscilação, ela volta ao normal.",
    "Se falhar de novo, me mande um print desta tela: é defeito e eu corrijo." ] };
  if (tipo === "cron_parou") return { title: `A rotina "${alvo}" parou de rodar`, who: "ambos", routine: alvo, steps: [
    "Confira no painel do Supabase se o projeto não está pausado ou com problema.",
    "Se estiver tudo normal, toque em “Rodar agora” nessa rotina.",
    "Se continuar parada, me chame." ] };
  if (tipo === "pico" && alvo === "erro_app") return { title: "Muitos erros no app em pouco tempo", who: "claude", routine: null, steps: [
    "Abra o app e veja se alguma tela está quebrada.",
    "Me mande um print desta tela, com os “Erros mais frequentes”: a correção é comigo." ] };
  if (tipo === "pico" && alvo === "ia_falha") return { title: "Muitas falhas da assistente de IA", who: "ambos", routine: null, steps: [
    "Entre na OpenRouter e confira o saldo e o limite de gasto da chave (ação sua).",
    "Se estiver tudo certo e as falhas continuarem, me chame. A assistente já tenta o modelo reserva sozinha." ] };
  if (tipo === "pico" && alvo === "funcao_erro") return { title: "Muitos erros em funções do servidor", who: "ambos", routine: null, steps: [
    "Veja nos “Erros mais frequentes” qual função falhou.",
    "Se for pagamento (payments ou platform-billing), confira no painel da Stripe se há eventos falhando; a Stripe reenvia sozinha por alguns dias.",
    "Me mande um print desta tela: a correção é comigo." ] };
  return { title: "Alerta técnico", who: "claude", routine: null, steps: ["Me mande um print desta tela para eu investigar."] };
}

export function describeError(kind, source) {
  if (kind === "ia_falha") return { who: "ambos", steps: [
    "Confira o saldo e o limite de gasto da chave na OpenRouter (ação sua).",
    "Se estiver tudo certo e repetir, me mande um print. A assistente já tenta o modelo reserva sozinha." ] };
  if (kind === "funcao_erro" && (source === "payments" || source === "platform-billing")) return { who: "ambos", steps: [
    "Confira no painel da Stripe se há eventos ou webhooks falhando; a Stripe reenvia sozinha por alguns dias.",
    "Se repetir, me mande um print: a correção é comigo." ] };
  if (kind === "funcao_erro" && source === "push-notify") return { who: "claude", steps: [
    "Isso só atrasa avisos no celular; o resto funciona normalmente.",
    "Se repetir, me mande um print." ] };
  return { who: "claude", steps: [
    kind === "erro_app" ? "É um defeito de tela; quem está usando segue com o resto do app." : "É um erro do servidor.",
    "Me mande um print desta tela: a correção é comigo." ] };
}

export const WHO_TEXT = { claude: "Quem resolve: eu (Claude)", voce: "Quem resolve: você", ambos: "Você confere e, se continuar, me chama" };

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

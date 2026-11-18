// Interruptor de emergência: leitura segura da configuração pública (platform_settings.maintenance) e textos de aviso.
// Falha segura: valor ausente ou inválido = nada em manutenção.
export const MAINTENANCE_LABEL = { assistant: "a assistente", payments: "os pagamentos" };
export const MAINTENANCE_DEFAULT = {
  assistant: "A assistente está em manutenção. Voltamos em breve.",
  payments: "Os pagamentos estão em manutenção. Nada foi cobrado. Voltamos em breve.",
};

export function readMaintenance(raw) {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const message = typeof v.message === "string" && v.message.trim() && v.message.trim().length <= 200 ? v.message.trim() : null;
  const assistant = v.assistant === true, payments = v.payments === true;
  return { assistant, payments, message, since: typeof v.since === "string" ? v.since : null, any: assistant || payments };
}

/** Texto da faixa para o usuário: a mensagem do dono, ou o texto padrão do que está em manutenção. */
export function maintenanceBanner(m) {
  if (!m || !m.any) return null;
  if (m.message) return m.message;
  if (m.assistant && m.payments) return "Estamos em manutenção na assistente e nos pagamentos. Nada foi cobrado. Voltamos em breve.";
  return m.payments ? MAINTENANCE_DEFAULT.payments : MAINTENANCE_DEFAULT.assistant;
}

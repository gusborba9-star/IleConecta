// Interruptor de emergência (platform_settings.maintenance). Cópia idêntica em cada função de borda (teste garante).
// Falha segura: só bloqueia quando a chave do módulo é exatamente true; valor ausente ou inválido não bloqueia.
export const MAINTENANCE_DEFAULT = {
  assistant: "A assistente está em manutenção. Voltamos em breve.",
  payments: "Os pagamentos estão em manutenção. Nada foi cobrado. Voltamos em breve.",
};

/** Mensagem para o usuário se o módulo ("assistant" | "payments") está em manutenção; senão null. */
export function maintenanceFor(value, module) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value[module] !== true) return null;
  const custom = typeof value.message === "string" ? value.message.trim() : "";
  return custom && custom.length <= 200 ? custom : MAINTENANCE_DEFAULT[module] ?? null;
}

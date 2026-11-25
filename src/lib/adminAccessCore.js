// Módulos de acesso da administração. O dono tem tudo; os demais só os módulos recebidos. A decisão de verdade é do banco (0139); aqui só mostramos o que a pessoa pode usar.
export const MODULES = [
  { key: "suporte", label: "Atender chamados", desc: "Ler e responder chamados, falar com a casa ou o cliente em nome da Equipe Ilê Conecta e encerrar o atendimento." },
  { key: "moderacao", label: "Verificar infrações", desc: "Analisar conteúdos e conversas denunciados, avaliações denunciadas e aplicar as medidas de moderação." },
  { key: "comunicacao", label: "Comunicados e contato", desc: "Enviar comunicados da plataforma e avisar contas que voltaram." },
  { key: "indicadores", label: "Ver números (só leitura)", desc: "Ver indicadores, pendências, planos, vagas e a linha do tempo das casas. Não altera nada." },
  { key: "contas", label: "Suspender e reativar contas", desc: "Suspender e reativar contas, pelo atendimento de um chamado. Medida pesada: dê só a quem for de total confiança." },
];
export const MODULE_KEYS = MODULES.map((m) => m.key);
export const OWNER_ONLY = "Só o dono: preços e planos, reembolsos, cobrança, CPF/CNPJ, exclusão de contas, documentos, histórico e a gestão desta equipe.";

export const NO_ACCESS = Object.freeze({ admin: false, owner: false, perms: Object.freeze([]) });

export function readAccess(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NO_ACCESS;
  if (raw.admin !== true) return NO_ACCESS;
  const owner = raw.owner === true;
  const perms = Array.isArray(raw.perms) ? [...new Set(raw.perms.filter((p) => typeof p === "string" && MODULE_KEYS.includes(p)))] : [];
  return { admin: true, owner, perms: Object.freeze(perms) };
}

export function canModule(access, module) {
  if (!access || access.admin !== true) return false;
  if (access.owner) return true;
  return module !== "dono" && access.perms.includes(module);
}

export function readAdminRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.user_id === "string" && /^[0-9a-f-]{36}$/i.test(raw.user_id) ? raw.user_id : null;
  if (!id) return null;
  const email = typeof raw.email === "string" ? raw.email.slice(0, 200) : "";
  const name = typeof raw.name === "string" ? raw.name.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) : "";
  const perms = Array.isArray(raw.perms) ? raw.perms.filter((p) => MODULE_KEYS.includes(p)) : [];
  return { userId: id, email, name, owner: raw.owner === true, perms: [...new Set(perms)], createdAt: typeof raw.created_at === "string" ? raw.created_at : "" };
}

export function readAdminList(raw) {
  return Array.isArray(raw) ? raw.map(readAdminRow).filter(Boolean) : [];
}

export function togglePerm(perms, key) {
  if (!MODULE_KEYS.includes(key)) return perms;
  return perms.includes(key) ? perms.filter((p) => p !== key) : [...perms, key];
}

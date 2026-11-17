// Leitor defensivo do histórico de alterações da administração (quem fez, o quê, quando).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (s, n) => String(s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

export function readAudit(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const id = Number(r.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (typeof r.key !== "string" || !r.key || r.key.length > 120) continue;
    const t = typeof r.created_at === "string" ? Date.parse(r.created_at) : NaN;
    if (!Number.isFinite(t)) continue;
    const adminId = typeof r.admin_id === "string" && UUID.test(r.admin_id) ? r.admin_id.toLowerCase() : null;
    const actor = typeof r.actor === "string" && clip(r.actor, 80) ? clip(r.actor, 80) : "Administrador removido";
    out.push({ id, key: r.key, createdAt: r.created_at, adminId, actor });
  }
  return out;
}

export function mergeAudit(a, b) {
  const seen = new Set();
  return [...a, ...b].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).sort((x, y) => y.id - x.id);
}

export function filterAudit(rows, adminId) {
  return adminId ? rows.filter((r) => r.adminId === adminId) : rows;
}

export function actors(rows) {
  const m = new Map();
  for (const r of rows) if (r.adminId && !m.has(r.adminId)) m.set(r.adminId, r.actor);
  return [...m].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
}

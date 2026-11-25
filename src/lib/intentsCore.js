// Busca por intenção: o cliente diz o que procura ("amor", "proteção"), não o nome de uma tradição. Sem React: testável.
const plain = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export const INTENTS = [
  { id: "prosperidade", label: "Prosperidade", terms: ["prosperidade", "abundancia", "dinheiro", "financeiro", "emprego", "negocio", "caminhos abertos", "abertura de caminho", "sorte"] },
  { id: "amor", label: "Amor", terms: ["amor", "relacionamento", "casamento", "uniao", "reconciliacao", "paixao", "afinidade", "namoro"] },
  { id: "protecao", label: "Proteção", terms: ["protecao", "defesa", "seguranca", "escudo", "fechamento de corpo", "descarrego", "afastamento", "limpeza"] },
  { id: "saude", label: "Saúde", terms: ["saude", "cura", "bem-estar", "bem estar", "equilibrio", "energia", "passe", "harmonia"] },
  { id: "orientacao", label: "Orientação", terms: ["orientacao", "consulta", "jogo de buzios", "buzios", "oraculo", "conselho", "direcao"] },
];

/** A intenção que o texto digitado representa (igual ao nome ou a um dos termos), ou null. */
export function intentOf(q) {
  const t = plain(q);
  if (t.length < 3) return null;
  return INTENTS.find((i) => plain(i.label) === t || i.terms.some((x) => x === t || (t.length >= 4 && x.startsWith(t)))) ?? null;
}

/** A casa combina com a intenção? `fields` = nome, bio, tags, ofertas e títulos de rituais/serviços dela. */
export function matchesIntent(intent, fields) {
  if (!intent) return false;
  const hay = plain(fields.filter((f) => typeof f === "string").join(" | "));
  // O termo precisa ser a palavra inteira (ou o plural dela): "cura" não acha "procura", "uniao" não acha "reuniao", "passe" não acha "passeio".
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return intent.terms.some((t) => {
    const forms = [t, `${t}s`, `${t}es`, ...(t.endsWith("ao") ? [`${t.slice(0, -2)}oes`] : [])];
    return new RegExp(`(^|[^a-z0-9])(${forms.map(esc).join("|")})($|[^a-z0-9])`).test(hay);
  });
}

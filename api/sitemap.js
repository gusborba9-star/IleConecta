// Mapa do site para o Google: a página inicial e a página pública de cada casa.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export default async function handler(req, res) {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "ile-conecta.vercel.app";
  const origin = `https://${host}`;
  let rows = [];
  if (base && key) {
    try {
      const r = await fetch(`${base}/rest/v1/houses?select=slug,updated_at&order=updated_at.desc&limit=5000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (r.ok) rows = await r.json();
    } catch {
      rows = [];
    }
  }
  const urls = [`<url><loc>${esc(origin)}/</loc></url>`, ...rows.filter((h) => /^[a-z0-9-]{3,60}$/.test(h.slug)).map((h) => `<url><loc>${esc(origin)}/c/${h.slug}</loc><lastmod>${new Date(h.updated_at).toISOString().slice(0, 10)}</lastmod></url>`)];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.statusCode = 200;
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}

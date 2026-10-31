// Pré-visualização da casa para o WhatsApp, Facebook, Telegram, Google e afins.
// O vercel.json só manda para cá quem é "robô de link"; pessoas continuam no app normal.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1503756234508-e32369269deb?w=1200&h=630&fit=crop";
const SLUG = /^[a-z0-9-]{3,60}$/;

export default async function handler(req, res) {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "ile-conecta.vercel.app";
  const origin = `https://${host}`;
  const slug = String(req.query?.slug ?? "").toLowerCase();

  let house = null;
  if (base && key && SLUG.test(slug)) {
    try {
      const url = `${base}/rest/v1/houses?slug=eq.${encodeURIComponent(slug)}&select=name,category,cover_url,offerings,profiles!houses_owner_id_fkey(avatar_url,bio,city,state)&limit=1`;
      const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (r.ok) house = (await r.json())[0] ?? null;
    } catch {
      house = null;
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  if (!house) {
    res.statusCode = 404;
    return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Casa não encontrada · Ilê Conecta</title></head><body><p>Casa não encontrada.</p></body></html>`);
  }

  const p = Array.isArray(house.profiles) ? house.profiles[0] ?? {} : house.profiles ?? {};
  const place = [p.city, p.state].filter(Boolean).join(", ");
  const title = `${house.name} · Ilê Conecta`;
  const about = (p.bio || house.offerings || "").replace(/\s+/g, " ").trim();
  const description = (about ? about.slice(0, 180) : `${house.category || "Casa espiritual"}${place ? ` em ${place}` : ""}. Conheça os serviços e rituais no Ilê Conecta.`);
  const image = house.cover_url || p.avatar_url || DEFAULT_IMAGE;
  const canonical = `${origin}/c/${slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: house.name,
    description,
    image,
    url: canonical,
    ...(place ? { address: { "@type": "PostalAddress", addressLocality: p.city || undefined, addressRegion: p.state || undefined, addressCountry: "BR" } } : {}),
  };

  res.statusCode = 200;
  res.end(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ilê Conecta">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head><body><h1>${esc(house.name)}</h1><p>${esc(description)}</p><p><a href="${esc(canonical)}">Abrir no Ilê Conecta</a></p></body></html>`);
}

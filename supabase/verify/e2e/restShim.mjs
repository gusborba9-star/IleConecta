// Camada MÍNIMA que faz o papel de PostgREST + GoTrue para o supabase-js real, sobre o PostgreSQL real.
// NÃO é o PostgREST: traduz o subconjunto usado pela função (select/update com filtros, embed muitos-para-um, rpc, auth/v1/user).
import { createServer } from "node:http";
import pg from "pg";

pg.types.setTypeParser(20, (v) => Number(v)); // bigint -> number, como o PostgREST
pg.types.setTypeParser(1700, (v) => Number(v));
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };

function splitTop(s) { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }

export async function startShim({ conn, serviceKey }) {
  const pool = new pg.Pool({ ...conn, max: 30 });
  pool.on("connect", (c) => c.query("select set_config('test.role','service_role',false)"));
  const log = { requests: 0, errors: [] };

  async function fk(table, rel) {
    const r = await pool.query(`select a.attname col, b.attname refcol from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute b on b.attrelid = c.confrelid and b.attnum = c.confkey[1]
      where c.contype='f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass limit 1`, [`public.${q(table)}`, `public.${q(rel)}`]);
    return r.rows[0];
  }
  async function selectList(table, sel) {
    const parts = splitTop(sel || "*"); const cols = [];
    for (const p of parts) {
      const m = p.match(/^(\w+)\((.*)\)$/);
      if (!m) { cols.push(p === "*" ? `${q(table)}.*` : `${q(table)}.${q(p)}`); continue; }
      const rel = m[1]; const f = await fk(table, rel);
      if (!f) throw Object.assign(new Error(`embed sem FK: ${table}->${rel}`), { code: "PGRST200" });
      const inner = splitTop(m[2]).map((c) => (c === "*" ? "r.*" : `r.${q(c)}`)).join(", ");
      cols.push(`(select to_jsonb(x) from (select ${inner} from public.${q(rel)} r where r.${q(f.refcol)} = ${q(table)}.${q(f.col)}) x) as ${q(rel)}`);
    }
    return cols.join(", ");
  }
  function where(sp, params) {
    const w = [];
    for (const [k, v] of sp.entries()) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      const m = v.match(/^(\w+)\.(.*)$/); if (!m) continue;
      const [, op, val] = m;
      if (op in OPS) { params.push(val); w.push(`${q(k)} ${OPS[op]} $${params.length}`); }
      else if (op === "is") w.push(`${q(k)} is ${val === "null" ? "null" : val}`);
      else if (op === "in") { const items = splitTop(val.replace(/^\(|\)$/g, "")).map((s) => s.replace(/^"|"$/g, "")); const ph = items.map((i) => { params.push(i); return `$${params.length}`; }); w.push(`${q(k)} in (${ph.join(",")})`); }
      else throw Object.assign(new Error(`operador não suportado: ${op}`), { code: "PGRST100" });
    }
    return w.length ? ` where ${w.join(" and ")}` : "";
  }
  function order(sp) { const o = sp.get("order"); if (!o) return ""; return " order by " + o.split(",").map((x) => { const [c, d] = x.split("."); return `${q(c)} ${d === "desc" ? "desc" : "asc"}`; }).join(", "); }

  const server = createServer(async (req, res) => {
    log.requests++;
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const u = new URL(req.url, "http://x");
    const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
    try {
      if (u.pathname === "/auth/v1/user") {
        const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        const m = t.match(/^user-([0-9a-f-]{36})$/); if (!m) return json(401, { msg: "invalid JWT", code: 401 });
        return json(200, { id: m[1], aud: "authenticated", role: "authenticated", email: `${m[1].slice(-4)}@e2e.test` });
      }
      if ((req.headers.apikey ?? "") !== serviceKey) return json(401, { message: "Invalid API key" });
      let m;
      if ((m = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/))) {
        const args = raw ? JSON.parse(raw) : {}; const names = Object.keys(args);
        const meta = (await pool.query(`select p.proretset, t.typtype, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype where p.pronamespace='public'::regnamespace and p.proname=$1 limit 1`, [m[1]])).rows[0];
        const sql = `select * from public.${q(m[1])}(${names.map((n, i) => `${q(n)} := $${i + 1}`).join(", ")})`;
        const r = await pool.query(sql, names.map((n) => (args[n] !== null && typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n])));
        if (meta?.typname === "void") return json(204);
        if (meta?.proretset || meta?.typtype === "c") return json(200, r.rows);
        return json(200, r.rows[0] ? Object.values(r.rows[0])[0] : null);
      }
      if ((m = u.pathname.match(/^\/rest\/v1\/(\w+)$/))) {
        const table = m[1]; const params = [];
        if (req.method === "HEAD") {
          const r = await pool.query(`select count(*)::int n from public.${q(table)}${where(u.searchParams, params)}`, params);
          res.writeHead(200, { "content-range": `*/${r.rows[0].n}` }); return res.end();
        }
        if (req.method === "POST") {
          const body = JSON.parse(raw); const rows = Array.isArray(body) ? body : [body];
          const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
          const vals = []; const tuples = rows.map((r) => `(${keys.map((k) => { const v = r[k] === undefined ? null : r[k]; vals.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `$${vals.length}`; }).join(", ")})`);
          const rep = /return=representation/.test(req.headers.prefer ?? "");
          const ret = rep ? ` returning ${await selectList(table, u.searchParams.get("select"))}` : "";
          const r = await pool.query(`insert into public.${q(table)} (${keys.map(q).join(", ")}) values ${tuples.join(", ")}${ret}`, vals);
          if (!rep) return json(201);
          if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(201, r.rows[0]);
          return json(201, r.rows);
        }
        if (req.method === "DELETE") {
          await pool.query(`delete from public.${q(table)}${where(u.searchParams, params)}`, params);
          return json(204);
        }
        if (req.method === "GET") {
          const cols = await selectList(table, u.searchParams.get("select"));
          let sql = `select ${cols} from public.${q(table)}${where(u.searchParams, params)}${order(u.searchParams)}`;
          if (u.searchParams.get("limit")) sql += ` limit ${Number(u.searchParams.get("limit"))}`;
          const r = await pool.query(sql, params);
          if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
            if (r.rows.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${r.rows.length} rows`, hint: null });
            return json(200, r.rows[0]);
          }
          return json(200, r.rows);
        }
        if (req.method === "PATCH") {
          const body = JSON.parse(raw); const keys = Object.keys(body);
          const sets = keys.map((k, i) => { params.push(body[k]); return `${q(k)} = $${i + 1}`; });
          const w = where(u.searchParams, params);
          const rep = /return=representation/.test(req.headers.prefer ?? "");
          const ret = rep ? ` returning ${await selectList(table, u.searchParams.get("select"))}` : "";
          const r = await pool.query(`update public.${q(table)} set ${sets.join(", ")}${w}${ret}`, params);
          return rep ? json(200, r.rows) : json(204);
        }
      }
      return json(404, { message: `shim: sem rota ${req.method} ${u.pathname}` });
    } catch (e) {
      log.errors.push(`${req.method} ${req.url}: ${e.message}`);
      return json(400, { code: e.code ?? "P0001", message: e.message, details: null, hint: null });
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, pool, log, close: async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await pool.end(); } })));
}

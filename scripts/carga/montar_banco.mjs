// Monta o banco LOCAL de teste de carga (todas as migrations). Uso: bash /tmp/pgup.sh && node scripts/carga/montar_banco.mjs
import { freshDb } from "../../supabase/verify/pgbase.mjs";
const { c, failed } = await freshDb("carga", { with64: true });
console.log("migrations com erro:", failed.filter((f) => !f.startsWith("0068")).join(" | ") || "nenhuma");
await c.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await c.end();

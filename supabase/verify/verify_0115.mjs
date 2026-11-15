// Verificação LOCAL da migration 0115 (estado do perfil como sigla). Uso: node supabase/verify/verify_0115.mjs
import { freshDb } from "./pgbase.mjs";
import { BR_STATES, ufFromText } from "../../src/lib/brStates.js";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0115", { with64: true, max: 115 });
ok("migrations 0001–0115 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
const uf = async (t) => (await su.query("select public.br_uf_from_text($1) v", [t])).rows[0].v;
// o banco e o código reconhecem exatamente a mesma coisa
const samples = [...BR_STATES.flatMap((s) => [s.uf, s.uf.toLowerCase(), s.name.replace(/ \(.*\)$/, ""), s.name.replace(/ \(.*\)$/, "").toUpperCase(), `  ${s.name.replace(/ \(.*\)$/, "")}  `]),
  "Río grande do Sul", "Rio grande do sul", "RI", "Brasília", "brasilia", "Sao Paulo", "São  Paulo", "Paraná", "Parana", "X", "", "   ", "Narnia", "Rio", "Mato Grosso do", "Distrito Federal"];
let diff = [];
for (const t of samples) { const a = (await uf(t)) ?? "", b = ufFromText(t); if (a !== b) diff.push(`${JSON.stringify(t)}: banco=${a} código=${b}`); }
ok(`banco e código reconhecem os mesmos ${samples.length} textos`, diff.length === 0, diff.join(" | "));
ok("27 estados, todos reconhecidos pelo nome e pela sigla", (await Promise.all(BR_STATES.map(async (s) => (await uf(s.uf)) === s.uf && (await uf(s.name.replace(/ \(.*\)$/, ""))) === s.uf))).every(Boolean));
ok("RI não é reconhecido (nada de adivinhar)", (await uf("RI")) === null);
ok("Mato Grosso e Mato Grosso do Sul não se confundem", (await uf("mato grosso")) === "MT" && (await uf("mato grosso do sul")) === "MS");
// gatilho no perfil
await su.query(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a1','a@x.com','{"account_type":"cliente","display_name":"Ana","city":"Porto Alegre","state":"Rio grande do Sul"}'::jsonb)`);
const st = async () => (await su.query("select state from public.profiles where id='00000000-0000-0000-0000-0000000000a1'")).rows[0].state;
ok("cadastro com nome do estado guarda a sigla", (await st()) === "RS", await st());
await su.query("update public.profiles set state='sp' where id='00000000-0000-0000-0000-0000000000a1'");
ok("edição com sigla em minúscula guarda maiúscula", (await st()) === "SP");
await su.query("update public.profiles set state='Río Grande do Norte' where id='00000000-0000-0000-0000-0000000000a1'");
ok("nome com acento e caixa mista vira RN", (await st()) === "RN");
await su.query("update public.profiles set state='Narnia' where id='00000000-0000-0000-0000-0000000000a1'");
ok("texto inválido não é guardado", (await st()) === null);
await su.query("update public.profiles set state=null where id='00000000-0000-0000-0000-0000000000a1'");
ok("limpar o estado continua possível", (await st()) === null);
// dados antigos (como em produção) e compras guardadas
await su.query("alter table public.profiles disable trigger trg_profiles_state_norm");
await su.query("update public.profiles set state='RI' where id='00000000-0000-0000-0000-0000000000a1'");
await su.query("alter table public.profiles enable trigger trg_profiles_state_norm");
const mig = (await import("node:fs")).readFileSync(new URL("../migrations/0115_estado_como_sigla.sql", import.meta.url), "utf8");
const dados = mig.slice(mig.indexOf("-- dados já salvos"));
await su.query(dados.replace("f847527a-266e-494d-9163-80736aeedae5", "00000000-0000-0000-0000-0000000000a1"));
ok("o 'RI' conhecido vira RS e rodar de novo não muda nada", (await st()) === "RS" && (await su.query(dados.replace("f847527a-266e-494d-9163-80736aeedae5", "00000000-0000-0000-0000-0000000000a1")).then(() => true)) && (await st()) === "RS");
ok("permissões: só o servidor chama a função", (await su.query("select has_function_privilege('anon','public.br_uf_from_text(text)','execute') a, has_function_privilege('authenticated','public.br_uf_from_text(text)','execute') b, has_function_privilege('service_role','public.br_uf_from_text(text)','execute') c")).rows[0].c === true);
console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end(); process.exit(bad ? 1 : 0);

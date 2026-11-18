// Verificação LOCAL da migration 0165 (limpeza de fotos órfãs). Uso: node supabase/verify/verify_0165.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0165";
const { c: su, failed } = await freshDb(name, { with64: true, max: 164 });
ok("migrations 0001–0164 aplicadas sem erro", failed.length === 0, failed.join(" | "));
const mig = readFileSync(new URL("../migrations/0165_limpeza_de_fotos_orfas.sql", import.meta.url), "utf8");
const q = (sql, p) => su.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const uuid = (i) => `d0165000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const CV = uuid(21);
const U1 = uuid(1), U2 = uuid(2), H1 = uuid(11), BASE = "https://x.supabase.co/storage/v1/object/public";
for (const [id, t] of [[U1, "casa"], [U2, "cliente"]]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,'Nome Teste') on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name", [id, t]); }
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Teste','casa-teste','base')", [H1, U1]);
const obj = (bucket, path, ageDays) => su.query("insert into storage.objects(bucket_id,name,owner,created_at) values ($1,$2,$3, now() - ($4 || ' days')::interval)", [bucket, path, U1, String(ageDays)]);
// arquivos antigos (4 dias): referenciados e não referenciados
await obj("avatars", `${U2}/avatar-ref.webp`, 4); await obj("avatars", `${U2}/avatar-velha.webp`, 4); await obj("avatars", `${U2}/avatar-nova-demais.webp`, 1);
await obj("covers", `${U1}/cover-ref.webp`, 4); await obj("covers", `${U1}/cover-velha.webp`, 4);
await obj("post-images", `${U1}/p-url.webp`, 4); await obj("post-images", `${U1}/p-card.webp`, 4); await obj("post-images", `${U1}/p-velha.webp`, 4);
await obj("chat-files", `${CV}/anexo-ref.pdf`, 4); await obj("chat-files", `${CV}/anexo-nunca-enviado.pdf`, 4); await obj("chat-files", `${CV}/anexo-denuncia.pdf`, 4);
await obj("moments", `${U1}/m-orfao-moments.jpg`, 4); await obj("ritual-records", `${U1}/r.mp4`, 0.5);
await su.query("update profiles set avatar_url=$2 where id=$1", [U2, `${BASE}/avatars/${U2}/avatar-ref.webp?t=1`]);
await su.query("update houses set cover_url=$2 where id=$1", [H1, `${BASE}/covers/${U1}/cover-ref.webp`]);
await su.query("alter table posts disable trigger posts_styled_guard"); // só o fixture: a regra de plano não é o assunto aqui
await su.query("insert into posts(house_id,content,image_url) values ($1,'a',$2)", [H1, `${BASE}/post-images/${U1}/p-url.webp`]);
const pc = await q("insert into posts(house_id,content,card_style,card_image_path) values ($1,'b','total',$2)", [H1, `${U1}/p-card.webp`]);
ok("post com card (caminho) criado para o teste", !pc.err, pc.err ?? "");
const conv = (await su.query("insert into conversations(id) values ($1) returning id", [CV])).rows[0].id;
await su.query("insert into conversation_members(conversation_id,user_id) values ($1,$2), ($1,$3)", [conv, U1, U2]);
const mg = await q("insert into messages(conversation_id,sender_id,text,attachment_path,attachment_type,attachment_name,attachment_size) values ($1,$2,'x',$3,'application/pdf','a.pdf',10)", [conv, U1, `${CV}/anexo-ref.pdf`]);
ok("mensagem com anexo criada para o teste", !mg.err, mg.err ?? "");
const rep = await q("insert into chat_reports(reporter_id, reported_id, conversation_id, reason, status) values ($1,$2,$3,'outro','aberta') returning id", [U2, U1, conv]);
if (!rep.err) await q("insert into report_files(report_id,bucket,path) values ($1,'chat-files',$2)", [rep.rows[0].id, `${CV}/anexo-denuncia.pdf`]);
ok("denúncia com arquivo criada para o teste", !rep.err, rep.err ?? "");

let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0165 aplica e reaplica sem erro", e === null, e ?? "");
const list = (await q("select bucket, path, kind from files_to_purge(500)")).rows;
const has = (b, p) => list.some((x) => x.bucket === b && x.path === `${U1}/${p}` || x.bucket === b && x.path === `${U2}/${p}` || x.path === `${CV}/${p}`);
ok("foto de perfil antiga sem ligação é apagada", has("avatars", "avatar-velha.webp"));
ok("foto de perfil em uso (endereço com ?t=) NÃO é apagada", !has("avatars", "avatar-ref.webp"));
ok("foto enviada há menos de 2 dias NÃO é apagada (carência)", !has("avatars", "avatar-nova-demais.webp"));
ok("capa antiga sem ligação é apagada; capa em uso fica", has("covers", "cover-velha.webp") && !has("covers", "cover-ref.webp"));
ok("imagem de post sem ligação é apagada; a do endereço e a do card ficam", has("post-images", "p-velha.webp") && !has("post-images", "p-url.webp") && !has("post-images", "p-card.webp"));
ok("anexo de chat nunca enviado é apagado; o enviado e o de denúncia aberta ficam", has("chat-files", "anexo-nunca-enviado.pdf") && !has("chat-files", "anexo-ref.pdf") && !has("chat-files", "anexo-denuncia.pdf"));
ok("tudo que sai é do tipo 'orphan' e nada de outros buckets entra por esta regra (ritual recente fica)", list.filter((x) => ["avatars", "covers", "post-images", "chat-files"].includes(x.bucket)).every((x) => x.kind === "orphan") && !has("ritual-records", "r.mp4"));
ok("momentos continuam com a regra própria (órfão de 4 dias sai)", has("moments", "m-orfao-moments.jpg"));
const total1 = list.filter((x) => ["avatars", "covers", "post-images", "chat-files"].includes(x.bucket)).length;
ok("exatamente 4 arquivos órfãos nos quatro buckets", total1 === 4, String(total1));
// depois de confirmar a saída, nada sobra e a rotina é inofensiva
const done = await q("select files_purged($1::jsonb) n", [JSON.stringify(list.filter((x) => x.kind === "orphan").map((x) => ({ bucket: x.bucket, path: x.path, kind: "orphan", ref: null })))]);
ok("files_purged aceita o tipo orphan para os novos buckets", !done.err, done.err ?? "");
const acl = (await q("select has_function_privilege('authenticated','public.files_to_purge(integer)','execute') a, has_function_privilege('service_role','public.files_to_purge(integer)','execute') s")).rows[0];
ok("só o serviço executa a limpeza", acl.a === false && acl.s === true, JSON.stringify(acl));
await su.end(); console.log(bad ? `${bad} FALHA(S) de ${total}` : `TUDO OK (${total})`); process.exit(bad ? 1 : 0);

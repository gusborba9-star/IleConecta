import test from "node:test";
import assert from "node:assert/strict";
import { runAdminAction, runDeletions, maskEmail, SupportError } from "../supabase/functions/support-admin/core.js";

const U = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";

function mk({ admin = true, user, resetErr, resendErr } = {}) {
  const log = [], sent = [];
  const u = user === undefined ? { id: U, email: "maria@exemplo.com", email_confirmed_at: "2026-01-01", last_sign_in_at: "2026-11-01", created_at: "2026-01-01" } : user;
  return {
    log, sent,
    deps: {
      isAdmin: async () => admin, actorId: ADMIN,
      authAdmin: { getUserById: async () => (u ? { data: { user: u }, error: null } : { data: null, error: { message: "User not found" } }) },
      authPublic: {
        resetPasswordForEmail: async (email) => { sent.push(["reset", email]); return { error: resetErr ?? null }; },
        resend: async (x) => { sent.push(["resend", x.email]); return { error: resendErr ?? null }; },
      },
      rpc: async (name, args) => { log.push([name, args]); return null; },
    },
  };
}
const act = (extra = {}) => ({ action: "send_password_reset", user_id: U, reason: "Pessoa pediu no chamado", case_id: CASE, ...extra });

test("não administrador é recusado antes de qualquer coisa", async () => {
  const { deps, sent, log } = mk({ admin: false });
  await assert.rejects(() => runAdminAction(deps, act()), (e) => e instanceof SupportError && e.status === 403);
  assert.equal(sent.length, 0); assert.equal(log.length, 0);
});

test("validações: ação, pessoa, motivo e chamado", async () => {
  const { deps } = mk();
  for (const bad of [act({ action: "delete_everything" }), act({ user_id: "abc" }), act({ reason: "x" }), act({ reason: "a".repeat(301) }), act({ case_id: "nao-uuid" }), { }]) {
    await assert.rejects(() => runAdminAction(deps, bad), SupportError);
  }
});

test("redefinição de senha vai para o e-mail da própria pessoa e o administrador só recebe o e-mail mascarado", async () => {
  const { deps, sent, log } = mk();
  const r = await runAdminAction(deps, act());
  assert.deepEqual(sent, [["reset", "maria@exemplo.com"]]);
  assert.equal(r.enviado_para, "ma***@exemplo.com");
  assert.ok(!JSON.stringify(r).includes("maria@"), "o resultado não expõe o e-mail inteiro");
  assert.equal(log[0][0], "support_log_action");
  assert.equal(log[0][1].p_action, "conta_send_password_reset");
  assert.equal(log[0][1].p_actor, ADMIN);
  assert.equal(log[0][1].p_case, CASE);
  assert.match(log[0][1].p_reason, /chamado/);
});

test("não existe ação de trocar e-mail nem de definir senha (decisão de segurança)", async () => {
  const { deps } = mk();
  for (const a of ["change_email", "set_password", "impersonate", "generate_link"]) await assert.rejects(() => runAdminAction(deps, act({ action: a })), SupportError);
});

test("reenvio de confirmação só vale para e-mail ainda não confirmado", async () => {
  const ok = mk({ user: { id: U, email: "ana@exemplo.com", email_confirmed_at: null } });
  const r = await runAdminAction(ok.deps, act({ action: "resend_confirmation" }));
  assert.equal(r.enviado_para, "an*@exemplo.com"); assert.deepEqual(ok.sent, [["resend", "ana@exemplo.com"]]);
  const done = mk();
  await assert.rejects(() => runAdminAction(done.deps, act({ action: "resend_confirmation" })), (e) => e.code === "ja_confirmado");
  assert.equal(done.sent.length, 0);
});

test("estado da conta mostra confirmação, último acesso e bloqueio, sem dados sensíveis", async () => {
  const { deps } = mk({ user: { id: U, email: "maria@exemplo.com", email_confirmed_at: "2026-01-01", last_sign_in_at: "2026-11-01", banned_until: "2999-01-01T00:00:00Z", encrypted_password: "SEGREDO" } });
  const r = await runAdminAction(deps, act({ action: "account_state" }));
  assert.equal(r.email_confirmado, true); assert.equal(r.bloqueada, true); assert.equal(r.ultimo_acesso, "2026-11-01");
  assert.ok(!JSON.stringify(r).includes("SEGREDO"));
});

test("conta inexistente ou já excluída não recebe nada", async () => {
  const none = mk({ user: null });
  await assert.rejects(() => runAdminAction(none.deps, act()), (e) => e.status === 404);
  const gone = mk({ user: { id: U, email: `excluida+${U}@invalid.local` } });
  await assert.rejects(() => runAdminAction(gone.deps, act()), (e) => e.code === "conta_excluida");
  assert.equal(gone.sent.length, 0);
});

test("falha do envio vira erro claro e NÃO grava como se tivesse enviado", async () => {
  const { deps, log } = mk({ resetErr: { message: "rate limit" } });
  await assert.rejects(() => runAdminAction(deps, act()), (e) => e.code === "falha_envio" && e.status === 502);
  assert.equal(log.length, 0);
});

test("maskEmail", () => {
  assert.equal(maskEmail("a@b.com"), "a*@b.com");
  assert.equal(maskEmail("sem-arroba"), "");
});

// ---------- rotina de exclusões
function mkDel({ due = [], files = [], pending = [], fileQueue = [], anonErr = {}, authErr = {}, storageErr = {} } = {}) {
  const calls = [];
  const pend = [...pending];
  const queue = [...fileQueue];
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (name === "account_deletions_due") return due;
    if (name === "anonymize_account_and_queue") {
      if (anonErr[args.p_user]) throw new Error(anonErr[args.p_user]);
      pend.push({ user_id: args.p_user }); return files;
    }
    if (name === "support_files_queue") { for (const f of args.p_items) queue.push({ id: "f" + queue.length, ...f }); return args.p_items.length; }
    if (name === "auth_cleanup_pending_list") return pend.slice();
    if (name === "auth_cleanup_mark") { if (args.p_done) pend.splice(pend.findIndex((p) => p.user_id === args.p_user), 1); return null; }
    if (name === "support_files_pending") return queue.slice();
    if (name === "support_files_done") { for (const id of args.p_ids) queue.splice(queue.findIndex((q) => q.id === id), 1); return args.p_ids.length; }
    throw new Error("rpc inesperada " + name);
  };
  const authCalls = [];
  const authAdmin = { updateUserById: async (id, attrs) => { authCalls.push([id, attrs]); return { error: authErr[id] ? { message: authErr[id] } : null }; } };
  const removed = [];
  const storage = { remove: async (bucket, paths) => { removed.push([bucket, paths]); return { error: storageErr[bucket] ? { message: storageErr[bucket] } : null }; } };
  return { calls, authCalls, removed, deps: { rpc, authAdmin, storage, randomPassword: () => "senha-aleatoria" }, queue, pend };
}

test("exclusão: anonimiza no banco, fecha o acesso (e-mail inválido, bloqueio, senha nova) e apaga os arquivos", async () => {
  const t = mkDel({ due: [{ request_id: "r1", user_id: U }], files: [{ bucket: "chat-files", path: `${U}/a.png` }, { bucket: "report-evidence", path: `${U}/p.pdf` }] });
  const out = await runDeletions(t.deps);
  assert.deepEqual([out.anonimizadas, out.acessos_fechados, out.arquivos_apagados, out.falhas.length], [1, 1, 2, 0]);
  const [id, attrs] = t.authCalls[0];
  assert.equal(id, U); assert.match(attrs.email, /@invalid\.local$/); assert.equal(attrs.ban_duration, "876000h"); assert.equal(attrs.password, "senha-aleatoria");
  assert.deepEqual(t.removed.map((x) => x[0]).sort(), ["chat-files", "report-evidence"]);
  // ordem: banco antes do acesso
  const names = t.calls.map((c) => c[0]);
  assert.ok(names.indexOf("anonymize_account_and_queue") < names.indexOf("auth_cleanup_pending_list"));
});

test("se o banco recusa a anonimização, o acesso NÃO é fechado", async () => {
  const t = mkDel({ due: [{ request_id: "r1", user_id: U }], anonErr: { [U]: "Há impedimentos pendentes." } });
  const out = await runDeletions(t.deps);
  assert.equal(out.anonimizadas, 0); assert.equal(out.acessos_fechados, 0); assert.equal(t.authCalls.length, 0);
  assert.equal(out.falhas[0].etapa, "anonimizar");
});

test("se o fechamento do acesso falha, fica na fila para repetir e a anonimização não repete", async () => {
  const t = mkDel({ due: [{ request_id: "r1", user_id: U }], authErr: { [U]: "auth indisponível" } });
  let out = await runDeletions(t.deps);
  assert.equal(out.acessos_fechados, 0); assert.equal(out.falhas[0].etapa, "acesso"); assert.equal(t.pend.length, 1);
  // próxima hora: nada novo vencido, mas a fila de acesso é retomada
  const t2 = mkDel({ due: [], pending: [{ user_id: U }] });
  out = await runDeletions(t2.deps);
  assert.equal(out.acessos_fechados, 1); assert.equal(t2.calls.filter((c) => c[0] === "anonymize_account_and_queue").length, 0);
});

test("conta que já não existe no login conta como fechada", async () => {
  const t = mkDel({ pending: [{ user_id: U }], authErr: { [U]: "User not found" } });
  const out = await runDeletions(t.deps);
  assert.equal(out.acessos_fechados, 1); assert.equal(out.falhas.length, 0);
});

test("falha ao apagar arquivos mantém na fila; sucesso limpa", async () => {
  const q = [{ id: "f1", bucket: "chat-files", path: "x/1" }, { id: "f2", bucket: "report-evidence", path: "x/2" }];
  const t = mkDel({ fileQueue: q, storageErr: { "chat-files": "timeout" } });
  const out = await runDeletions(t.deps);
  assert.equal(out.arquivos_apagados, 1); assert.equal(out.falhas[0].etapa, "arquivos"); assert.deepEqual(t.queue.map((x) => x.id), ["f1"]);
});

test("sem nada vencido, a rotina não faz nada", async () => {
  const t = mkDel();
  const out = await runDeletions(t.deps);
  assert.deepEqual(out, { anonimizadas: 0, acessos_fechados: 0, arquivos_apagados: 0, falhas: [] });
  assert.equal(t.authCalls.length, 0);
});

test("ataque: o e-mail do envio vem sempre da conta, nunca de um valor enviado pelo chamador", async () => {
  const { deps, sent } = mk();
  await runAdminAction(deps, act({ email: "atacante@exemplo.com", to: "atacante@exemplo.com", redirect_to: undefined }));
  assert.deepEqual(sent, [["reset", "maria@exemplo.com"]]);
});

import { safeRedirect } from "../supabase/functions/support-admin/core.js";
test("redirecionamento da recuperação: só a tela /redefinir-senha do app; destinos de atacante são descartados", async () => {
  assert.equal(safeRedirect("https://ile-conecta.vercel.app/redefinir-senha"), "https://ile-conecta.vercel.app/redefinir-senha");
  assert.equal(safeRedirect("http://localhost:5173/redefinir-senha"), "http://localhost:5173/redefinir-senha");
  for (const bad of ["https://evil.com/phish", "https://x.com/redefinir-senha?next=//evil.com", "https://x.com/redefinir-senha#a", "http://x.com/redefinir-senha", "javascript:alert(1)", "https://u:p@x.com/redefinir-senha", "//evil.com/redefinir-senha", "", null, undefined, 5]) assert.equal(safeRedirect(bad), null, String(bad));
  const captured = [];
  const { deps } = mk(); deps.authPublic.resetPasswordForEmail = async (e, o) => { captured.push(o); return { error: null }; };
  await runAdminAction(deps, act({ redirect_to: "https://evil.com/phish" }));
  await runAdminAction(deps, act({ redirect_to: "https://ile-conecta.vercel.app/redefinir-senha" }));
  assert.equal(captured[0], undefined); assert.deepEqual(captured[1], { redirectTo: "https://ile-conecta.vercel.app/redefinir-senha" });
});

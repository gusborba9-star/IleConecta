// Regras da função "support-admin" (sem HTTP, sem Supabase direto: tudo entra por parâmetro, para testar sem rede).
// Duas portas: ações do administrador (senha, confirmação de e-mail, estado da conta) e a rotina de exclusões.
// Segurança: o administrador NUNCA vê senha nem link de redefinição; o e-mail de redefinição vai para o endereço da própria pessoa.
// Toda ação exige motivo e fica no registro de suporte.

export const ADMIN_ACTIONS = ["send_password_reset", "resend_confirmation", "account_state"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só aceita voltar para a tela de nova senha do próprio app (https, ou http em localhost); qualquer outro destino é ignorado. */
export function safeRedirect(v) {
  try {
    const u = new URL(String(v ?? ""));
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if ((u.protocol === "https:" || (local && u.protocol === "http:")) && u.pathname === "/redefinir-senha" && !u.username && !u.password && !u.search && !u.hash) return u.toString();
  } catch { /* inválida */ }
  return null;
}

export class SupportError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

/** Valida e executa uma ação do administrador. `deps`: { isAdmin(): Promise<boolean>, actorId, authAdmin, authPublic, rpc } */
export async function runAdminAction(deps, input) {
  const { isAdmin, actorId, authAdmin, authPublic, rpc } = deps;
  if (!(await isAdmin())) throw new SupportError("nao_autorizado", "Apenas administradores.", 403);
  const action = String(input?.action ?? "");
  if (!ADMIN_ACTIONS.includes(action)) throw new SupportError("acao_invalida", "Ação inválida.");
  const userId = String(input?.user_id ?? "");
  if (!UUID.test(userId)) throw new SupportError("usuario_invalido", "Pessoa inválida.");
  const reason = String(input?.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 300) throw new SupportError("motivo", "Informe o motivo (5 a 300 caracteres).");
  const caseId = input?.case_id ? String(input.case_id) : null;
  if (caseId && !UUID.test(caseId)) throw new SupportError("chamado_invalido", "Chamado inválido.");

  const { data: found, error: getErr } = await authAdmin.getUserById(userId);
  const u = found?.user;
  if (getErr || !u) throw new SupportError("nao_encontrada", "Conta não encontrada.", 404);
  if (/@invalid\.local$/i.test(u.email ?? "")) throw new SupportError("conta_excluida", "Esta conta já foi excluída.", 409);

  let result;
  if (action === "account_state") {
    result = {
      email_confirmado: Boolean(u.email_confirmed_at),
      ultimo_acesso: u.last_sign_in_at ?? null,
      criada_em: u.created_at ?? null,
      bloqueada: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
      email_mascarado: maskEmail(u.email),
    };
  } else if (action === "send_password_reset") {
    const { error } = await authPublic.resetPasswordForEmail(u.email, safeRedirect(input.redirect_to) ? { redirectTo: safeRedirect(input.redirect_to) } : undefined);
    if (error) throw new SupportError("falha_envio", "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.", 502);
    result = { enviado_para: maskEmail(u.email) };
  } else {
    if (u.email_confirmed_at) throw new SupportError("ja_confirmado", "O e-mail desta conta já está confirmado.", 409);
    const { error } = await authPublic.resend({ type: "signup", email: u.email });
    if (error) throw new SupportError("falha_envio", "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.", 502);
    result = { enviado_para: maskEmail(u.email) };
  }
  await rpc("support_log_action", { p_case: caseId, p_actor: actorId, p_action: "conta_" + action, p_reason: reason, p_data: { usuario: userId } });
  return result;
}

export function maskEmail(email) {
  const [name, host] = String(email ?? "").split("@");
  if (!host) return "";
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${host}`;
}

const NOT_FOUND = /not.?found|no.?user/i;

/**
 * Rotina das exclusões. Ordem importa: primeiro o banco (que confere prazo e impedimentos), depois o acesso (login) e, por fim, os arquivos.
 * Se o acesso ou os arquivos falharem, a pessoa já está anonimizada e a tentativa fica numa fila para repetir (nada se perde nem se repete a anonimização).
 * `deps`: { rpc(name, args) -> dados (lança erro se falhar), authAdmin, storage: { remove(bucket, paths) }, randomPassword(), provider?: { remove(provider, kind, ref) } }
 * `provider.remove` desvincula o cartão / apaga o cliente no provedor de pagamento (a fila vem do banco; falha deixa na fila para repetir).
 */
export async function runDeletions(deps) {
  const { rpc, authAdmin, storage, randomPassword } = deps;
  const out = { anonimizadas: 0, acessos_fechados: 0, arquivos_apagados: 0, cartoes_removidos: 0, falhas: [] };

  const due = await rpc("account_deletions_due", {});
  for (const d of due ?? []) {
    let files;
    try { files = await rpc("anonymize_account_and_queue", { p_user: d.user_id, p_request: d.request_id }); }
    catch (error) { out.falhas.push({ etapa: "anonimizar", usuario: d.user_id, erro: String(error?.message ?? error).slice(0, 120) }); continue; }
    out.anonimizadas++;
    await rpc("support_files_queue", { p_items: files ?? [] });
  }

  // fecha o acesso de todas as contas anonimizadas (inclui as que falharam antes)
  const pending = await rpc("auth_cleanup_pending_list", { p_limit: 20 });
  for (const p of pending ?? []) {
    const { error } = await authAdmin.updateUserById(p.user_id, {
      email: `excluida+${p.user_id}@invalid.local`, password: randomPassword(), ban_duration: "876000h", user_metadata: {}, app_metadata: {},
    });
    if (error && !NOT_FOUND.test(String(error.message ?? error))) {
      await rpc("auth_cleanup_mark", { p_user: p.user_id, p_done: false, p_error: String(error.message ?? error) });
      out.falhas.push({ etapa: "acesso", usuario: p.user_id, erro: String(error.message ?? error).slice(0, 120) });
      continue;
    }
    await rpc("auth_cleanup_mark", { p_user: p.user_id, p_done: true });
    out.acessos_fechados++;
  }

  // arquivos na fila (da exclusão e de chamados vencidos)
  const items = (await rpc("support_files_pending", { p_limit: 100 })) ?? [];
  const byBucket = new Map();
  for (const it of items) byBucket.set(it.bucket, [...(byBucket.get(it.bucket) ?? []), it]);
  const done = [];
  for (const [bucket, list] of byBucket) {
    const { error } = await storage.remove(bucket, list.map((i) => i.path));
    if (error) out.falhas.push({ etapa: "arquivos", bucket, erro: String(error.message ?? error).slice(0, 120) });
    else done.push(...list.map((i) => i.id));
  }
  if (done.length) { await rpc("support_files_done", { p_ids: done }); out.arquivos_apagados = done.length; }

  // cartões e clientes no provedor de pagamento (o banco já apagou o cartão guardado; aqui o provedor esquece também)
  if (deps.provider) {
    const queue = (await rpc("provider_cleanup_list", { p_limit: 20 })) ?? [];
    for (const it of queue) {
      try { await deps.provider.remove(it.provider, it.kind, it.ref); }
      catch (error) {
        await rpc("provider_cleanup_mark", { p_id: it.id, p_done: false, p_error: String(error?.message ?? error) });
        out.falhas.push({ etapa: "cartao", erro: String(error?.message ?? error).slice(0, 120) });
        continue;
      }
      await rpc("provider_cleanup_mark", { p_id: it.id, p_done: true });
      out.cartoes_removidos++;
    }
  }
  return out;
}

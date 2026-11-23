// Núcleo puro do login com bloqueio (sem rede): nome do aparelho, id do aparelho e mensagens. Testável em node.

/** Nome amigável do aparelho a partir do user-agent: só sistema e navegador, nada que identifique a pessoa. */
export function deviceLabel(ua) {
  const s = String(ua ?? "");
  const os = /iPhone|iPad|iPod/.test(s) ? "iPhone/iPad" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X|Macintosh/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "Aparelho";
  const br = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Firefox|FxiOS/.test(s) ? "Firefox" : /Chrome|CriOS/.test(s) ? "Chrome" : /Safari/.test(s) ? "Safari" : "navegador";
  return `${os} · ${br}`;
}

/** Id aleatório do aparelho (43 caracteres): só o hash dele chega ao banco. */
export function newDeviceId(randomBytes) {
  const b = randomBytes(32);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mensagem do bloqueio: igual para e-mail com ou sem conta. */
export function lockMessage(until, needsEmail, nowMs = Date.now()) {
  if (needsEmail) return "Por segurança, o acesso foi bloqueado por muitas tentativas. Se existir uma conta com esse e-mail, enviamos um aviso com o botão para desbloquear. Se não conseguir, use \"Perdi o acesso à minha conta\".";
  const t = Date.parse(until ?? "");
  const mins = Number.isFinite(t) ? Math.max(1, Math.ceil((t - nowMs) / 60000)) : 15;
  const when = mins >= 60 ? `${Math.ceil(mins / 60)} h` : `${mins} min`;
  return `Muitas tentativas de senha. Tente de novo em ${when}. Se existir uma conta com esse e-mail, enviamos um aviso com o botão para desbloquear.`;
}

export const LOGIN_ERRORS = {
  credenciais: "E-mail ou senha incorretos.",
  nao_confirmado: "Confirme seu e-mail antes de entrar. Enviamos um link para você.",
  muitas_tentativas: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  indisponivel: "Serviço indisponível agora. Tente novamente em instantes.",
  pedido_invalido: "Confira o e-mail e a senha.",
};

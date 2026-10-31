import type { ConsentDocKey } from "@/lib/legalCore";

const KEY = "ile:aceite-pendente";

/** Guarda o aceite marcado no cadastro até a primeira entrada (com confirmação de e-mail ainda não há sessão para gravar). */
export function savePendingConsent(email: string, doc: ConsentDocKey): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), doc }));
  } catch {
    /* sem armazenamento: o aceite será pedido no primeiro uso, como antes */
  }
}

/** Devolve (e apaga) o aceite pendente se for da mesma conta que acabou de entrar. */
export function takePendingConsent(email: string | undefined): ConsentDocKey | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { email?: string; doc?: string };
    if (!email || v.email !== email.trim().toLowerCase()) return null;
    localStorage.removeItem(KEY);
    return v.doc === "termos_casa" || v.doc === "termos_cliente" ? v.doc : null;
  } catch {
    return null;
  }
}

import { supabase } from "@/lib/supabase";

// Chave pública VAPID (a privada fica só no servidor).
const VAPID_PUBLIC = "BCUR2tZ1IX9d_oGLmtfflaXRX0uefES6Jhtx8JpQAU7TlgR2Ria6eo587_jOn1tY4hhf20b4AekUHQ2PuBzWkYU";

export type PushState = "unsupported" | "denied" | "off" | "on";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64Url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    return (await currentSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Pede permissão, registra o aparelho e guarda no servidor. Devolve a mensagem de erro em português ou null. */
export async function enablePush(): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  if (!pushSupported()) return "Este aparelho não aceita avisos. No iPhone, adicione o Ilê Conecta à tela de início primeiro.";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "Os avisos ficaram bloqueados. Libere nas configurações do site e tente de novo.";
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
    const json = sub.toJSON();
    const { error } = await supabase.rpc("save_push_subscription", {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? "",
      p_auth: json.keys?.auth ?? "",
      p_ua: navigator.userAgent,
    });
    return error ? error.message : null;
  } catch {
    return "Não foi possível ativar os avisos agora. Tente de novo.";
  }
}

export async function disablePush(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    if (supabase) await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch {
    /* sem aparelho registrado: nada a desfazer */
  }
}

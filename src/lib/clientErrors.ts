import { supabase } from "@/lib/supabase";
import { criarRelator } from "@/lib/clientErrorsCore.js";

// Relata ao servidor os erros inesperados do app (só com a pessoa logada; o relato não identifica ninguém).
// A administração vê os mais frequentes em "Saúde da plataforma". Qualquer falha aqui é silenciosa.
const relator = criarRelator({
  origem: typeof window !== "undefined" ? window.location.origin : "",
  send: async (route: string, message: string) => {
    if (!supabase) return;
    await supabase.rpc("report_client_error", { p_route: route, p_message: message, p_source: "app" });
  },
});

export function reportClientError(err: unknown) {
  try {
    relator(err, typeof window !== "undefined" ? window.location.pathname : "");
  } catch {
    /* relatar nunca atrapalha o app */
  }
}

let instalado = false;
export function installClientErrorReporting() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  window.addEventListener("error", (ev) => reportClientError(ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => reportClientError(ev.reason));
}

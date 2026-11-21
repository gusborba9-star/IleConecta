import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { TOAST_CLASSES } from "./toastClasses";

/** Avisos (toasts) do sistema: cartão elegante com faixa de cor, ícone em círculo e botão de fechar dentro. Acompanham o tema escolhido no app, não só o do aparelho. */
export default function ThemedToaster() {
  const read = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = useState<"dark" | "light">(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  // O botão de fechar da biblioteca vem em inglês ("Close toast"): troca por português assim que aparece.
  useEffect(() => {
    const fix = () => document.querySelectorAll<HTMLElement>("[data-sonner-toast] [data-close-button]").forEach((b) => b.getAttribute("aria-label") !== "Fechar aviso" && b.setAttribute("aria-label", "Fechar aviso"));
    const obs = new MutationObserver(fix);
    obs.observe(document.body, { childList: true, subtree: true });
    fix();
    return () => obs.disconnect();
  }, []);
  const bubble = (cls: string, icon: React.ReactNode) => <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>{icon}</span>;
  return (
    <Toaster
      theme={theme}
      position="top-center"
      offset={{ top: 76 }}
      mobileOffset={{ top: 76, left: 12, right: 12 }}
      className="ic-toaster"
      closeButton
      duration={5000}
      gap={10}
      containerAriaLabel="Avisos do sistema"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", "--width": "400px" } as React.CSSProperties}
      icons={{
        success: bubble("bg-forest/15 text-forest", <CheckCircle2 className="h-5 w-5" aria-hidden />),
        error: bubble("bg-destructive/15 text-destructive", <XCircle className="h-5 w-5" aria-hidden />),
        warning: bubble("bg-gold/20 text-gold-ink", <AlertTriangle className="h-5 w-5" aria-hidden />),
        info: bubble("bg-muted text-foreground", <Info className="h-5 w-5" aria-hidden />),
      }}
      toastOptions={{ unstyled: true, classNames: TOAST_CLASSES }}
    />
  );
}

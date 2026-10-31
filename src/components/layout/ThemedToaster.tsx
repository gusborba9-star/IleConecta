import { useEffect, useState } from "react";
import { Toaster } from "sonner";

/** Avisos (toasts) acompanham o tema escolhido no app, não só o do aparelho. */
export default function ThemedToaster() {
  const read = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = useState<"dark" | "light">(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return <Toaster theme={theme} position="top-right" richColors closeButton style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }} />;
}

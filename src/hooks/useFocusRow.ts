import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { readFocus } from "@/lib/focusCore.js";

/** Rola até a linha marcada com data-foco igual a ?foco= e a destaca. Espera a tela carregar (até ~5 s) e não faz nada se a linha não existir. */
export function useFocusRow(dep?: unknown) {
  const [params] = useSearchParams();
  const focus = readFocus(params.get("foco"));
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    let done: Element | null = null;
    const t = window.setInterval(() => {
      const el = document.querySelector(`[data-foco="${focus}"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.setAttribute("data-focused", "true");
        done = el;
        window.clearInterval(t);
      } else if (++tries > 33) window.clearInterval(t);
    }, 150);
    return () => {
      window.clearInterval(t);
      done?.removeAttribute("data-focused");
    };
  }, [focus, dep]);
}

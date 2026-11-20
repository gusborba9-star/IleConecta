import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Mantém o Tab dentro da janela aberta (a mais interna, se houver outra por cima): o foco não escapa para a página de trás.
 *  Vale para janelas próprias de tela cheia (visualizador e editor de momentos); as janelas comuns já fazem isso no componente Modal. */
export function useFocusTrap(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root.current) return;
      const dialogs = [root.current, ...Array.from(root.current.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))];
      const top = dialogs[dialogs.length - 1];
      const items = Array.from(top.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getAttribute("aria-hidden") !== "true" && el.getClientRects().length > 0);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1], active = document.activeElement;
      if (!top.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [root]);
}

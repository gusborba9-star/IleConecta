export type ThemePref = "claro" | "escuro" | "auto";
const KEY = "ile:tema";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "claro" || v === "escuro" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** O tema que vale agora (resolve o "automático" pelo ajuste do aparelho). */
export function resolveTheme(pref: ThemePref): "claro" | "escuro" {
  if (pref !== "auto") return pref;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function applyTheme(pref: ThemePref): void {
  const dark = resolveTheme(pref) === "escuro";
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1b1411" : "#c94b1f");
}

/** Salva a escolha neste aparelho e aplica na hora. */
export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  applyTheme(pref);
}

/** No modo automático, acompanha o aparelho se ele mudar de claro para escuro (ex.: ao anoitecer). */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return () => {};
  const on = () => getThemePref() === "auto" && applyTheme("auto");
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}

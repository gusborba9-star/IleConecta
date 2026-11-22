import { readPlaceNow } from "@/lib/geoCore.js";

/** Cidade onde a pessoa está agora (viagem), só neste aparelho e por até 7 dias. Sem React, para o banco de anúncios poder ler. */
const KEY = "ic.place.now";
const listeners = new Set<() => void>();
export const readRaw = (): string => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const emit = () => listeners.forEach((l) => l());
export const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
};

export function setPlaceNow(city: string, state: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ city, state, at: Date.now() })); } catch { /* sem armazenamento: vale só até recarregar */ }
  emit();
}
export function clearPlaceNow() {
  try { localStorage.removeItem(KEY); } catch { /* nada a limpar */ }
  emit();
}

/** Parâmetros para o banco escolher os anúncios da cidade do momento; vazio quando não há (vale o perfil). */
export function placeArgs(): { p_city?: string; p_state?: string } {
  const p = readPlaceNow(readRaw());
  return p ? { p_city: p.city, p_state: p.state } : {};
}

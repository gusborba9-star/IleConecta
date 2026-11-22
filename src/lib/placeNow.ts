import { useMemo, useSyncExternalStore } from "react";
import { useApp } from "@/contexts/AppContext";
import { nearestPlace, readPlaceNow } from "@/lib/geoCore.js";
import { clearPlaceNow, readRaw, setPlaceNow, subscribe } from "@/lib/placeStore";

export { clearPlaceNow, setPlaceNow };

/** Cidade que vale para mostrar casas e rituais: a do momento (se houver e estiver válida) ou a do perfil. */
export function usePlace() {
  const { currentUser } = useApp();
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const now = useMemo(() => readPlaceNow(raw), [raw]);
  const home = { city: currentUser?.city ?? "", state: currentUser?.state ?? "" };
  return { city: now?.city ?? home.city, state: now?.state ?? home.state, temporary: Boolean(now), home };
}

export type DetectResult = { ok: true; city: string; state: string } | { ok: false; reason: "negado" | "indisponivel" | "fora" };

/** Pede a posição ao navegador (a pessoa autoriza na hora) e converte em cidade no próprio aparelho. */
export async function detectPlace(): Promise<DetectResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { ok: false, reason: "indisponivel" };
  const pos = await new Promise<GeolocationPosition | "negado" | "indisponivel">((resolve) =>
    navigator.geolocation.getCurrentPosition((p) => resolve(p), (e) => resolve(e.code === 1 ? "negado" : "indisponivel"), { enableHighAccuracy: false, timeout: 12_000, maximumAge: 600_000 })
  );
  if (typeof pos === "string") return { ok: false, reason: pos };
  const table = (await import("@/data/municipios.json")).default as [string, string, number, number][];
  const p = nearestPlace(pos.coords.latitude, pos.coords.longitude, table);
  return p ? { ok: true, city: p.city, state: p.state } : { ok: false, reason: "fora" };
}

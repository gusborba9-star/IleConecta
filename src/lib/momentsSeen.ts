import { parseSeen, serializeSeen } from "@/lib/momentsCore";

const SEEN_KEY = "ile.moments.seen";

/** Momentos já vistos neste aparelho (guardados só aqui, sem ir ao servidor). Sem armazenamento disponível: simplesmente não lembra. */
export function readSeen(): Set<string> {
  try { return parseSeen(window.localStorage.getItem(SEEN_KEY)); } catch { return new Set<string>(); }
}
export function saveSeen(seen: Set<string>, liveIds: string[]): void {
  try { window.localStorage.setItem(SEEN_KEY, serializeSeen(seen, liveIds)); } catch { /* sem armazenamento */ }
}

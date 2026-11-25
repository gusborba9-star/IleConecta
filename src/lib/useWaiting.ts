import { useCallback, useEffect, useState } from "react";
import { fetchWaiting, type WaitingPerson } from "@/lib/video";

/** Quem espera na sala de espera, vista de quem modera; atualiza sozinha a cada poucos segundos. */
export function useWaiting(meetingId: string, active: boolean) {
  const [list, setList] = useState<WaitingPerson[]>([]);
  const reload = useCallback(async () => { setList(await fetchWaiting(meetingId)); }, [meetingId]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const run = async () => { const l = await fetchWaiting(meetingId); if (alive) setList(l); };
    void run();
    const t = setInterval(() => void run(), 5000);
    return () => { alive = false; clearInterval(t); };
  }, [meetingId, active]);
  return { list, reload };
}


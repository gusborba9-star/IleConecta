import { useEffect, useState } from "react";
import { Modal } from "@/components/base";
import { fetchAttendees, type Attendee, type RealRitual } from "@/lib/rituals";

export default function Attendees({ ritual, onClose }: { ritual: RealRitual | null; onClose: () => void }) {
  const [list, setList] = useState<Attendee[] | null>(null);

  useEffect(() => {
    setList(null);
    if (!ritual) return;
    let alive = true;
    void fetchAttendees(ritual.id).then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [ritual]);

  if (!ritual) return null;
  const label = (id: string) => ritual.fields.find((f) => f.id === id)?.label ?? id;
  const active = (list ?? []).filter((a) => a.status === "confirmada" || a.status === "aguardando_pagamento");

  return (
    <Modal open onClose={onClose} title={`Participantes — ${ritual.title}`} maxWidth="max-w-2xl">
      {list === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém reservou ainda.</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((a) => (
            <li key={a.reservationId} className="py-3">
              <div className="font-semibold">{a.name}</div>
              <dl className="mt-1 grid gap-x-3 text-sm sm:grid-cols-[max-content_1fr]">
                {Object.entries(a.answers).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{label(k)}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Dados pessoais dos participantes: use somente para realizar o ritual (LGPD).</p>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input, Label } from "@/components/base";
import { adminFetchStaffAudit, actorLabel, describeStaffEvent, type StaffAuditEvent } from "@/lib/staffAudit";
import { supabase } from "@/lib/supabase";

interface HouseRow { house_id: string; name: string }

/** Histórico da equipe de uma casa, para apurar denúncias e disputas. Exige motivo e a consulta fica registrada (a casa não vê). */
export default function StaffAuditCard() {
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [houseId, setHouseId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<StaffAuditEvent[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc("admin_houses_plans").then(({ data }) => {
      const list = ((data as HouseRow[] | null) ?? []).map((r) => ({ house_id: r.house_id, name: r.name }));
      setHouses(list);
    });
  }, []);

  const consult = async () => {
    if (!houseId) return void toast.error("Escolha a casa.");
    setBusy(true);
    const r = await adminFetchStaffAudit(houseId, reason);
    setBusy(false);
    if (typeof r === "string") return void toast.error(r);
    setEvents(r);
    setReason("");
  };

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Histórico da equipe de uma casa</h2>
      <p className="text-xs text-muted-foreground">Para apurar denúncias e disputas. Informe o motivo: cada consulta fica registrada com o seu nome e não aparece para a casa.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="sa-house">Casa</Label>
          <select id="sa-house" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={houseId} onChange={(e) => { setHouseId(e.target.value); setEvents(null); }}>
            <option value="">Escolha…</option>
            {houses.map((h) => <option key={h.house_id} value={h.house_id}>{h.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="sa-reason">Motivo da consulta</Label>
          <Input id="sa-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: denúncia nº 123" />
        </div>
      </div>
      <Button onClick={() => void consult()} disabled={busy}>{busy ? "Consultando…" : "Consultar"}</Button>
      {events && (events.length === 0 ? <p className="text-sm text-muted-foreground">Nada registrado para esta casa.</p> : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="text-sm border-b border-border/60 pb-2 last:border-0">
              <div>{describeStaffEvent(e)}</div>
              <div className="text-xs text-muted-foreground">{actorLabel(e.actorRole)} · {new Date(e.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
            </li>
          ))}
        </ul>
      ))}
    </Card>
  );
}

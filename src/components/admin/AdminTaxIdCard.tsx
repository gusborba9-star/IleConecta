import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { supabase } from "@/lib/supabase";
import { adminSetTaxId, adminViewTaxId } from "@/lib/taxId";
import { formatTaxIdInput, taxIdKind } from "@/lib/taxIdCore";

interface HouseRow { house_id: string; name: string }

/** Administração: consulta o CPF/CNPJ de uma casa (motivo obrigatório, fica registrado) e corrige quando o Suporte pedir. */
export default function AdminTaxIdCard() {
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [fix, setFix] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc("admin_houses_plans").then(({ data }) => setHouses(((data as HouseRow[] | null) ?? []).map((h) => ({ house_id: String(h.house_id), name: String(h.name) }))));
  }, []);
  // o número completo não fica na tela: some sozinho em 30 segundos
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(null), 30_000);
    return () => window.clearTimeout(t);
  }, [shown]);
  const reasonOk = reason.trim().length >= 10;
  const view = async () => {
    setBusy(true);
    const r = await adminViewTaxId(pick, reason.trim());
    setBusy(false);
    if (r.error) return void toast.error(r.error);
    setShown(r.doc ? `${r.kind === "cnpj" ? "CNPJ" : "CPF"}: ${r.doc}` : "A casa ainda não informou o documento.");
  };
  const correct = async () => {
    if (!taxIdKind(fix)) return void toast.error("CPF ou CNPJ inválido.");
    setBusy(true);
    const err = await adminSetTaxId(pick, fix, reason.trim());
    setBusy(false);
    if (err) return void toast.error(err);
    toast.success("Documento corrigido e registrado.");
    setFix("");
    setShown(null);
  };
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">CPF/CNPJ das casas</h2>
      <p className="text-xs text-muted-foreground">Cada consulta e cada correção ficam registradas com o seu nome e o motivo. Não copie o número para fora do necessário.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Casa" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={pick} onChange={(e) => { setPick(e.target.value); setShown(null); }}>
          <option value="">Escolha uma casa…</option>
          {houses.map((h) => <option key={h.house_id} value={h.house_id}>{h.name}</option>)}
        </select>
        <Input aria-label="Motivo" className="flex-1 min-w-[14rem]" placeholder="Motivo (mínimo de 10 caracteres)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <Button variant="outline" disabled={!pick || !reasonOk || busy} onClick={() => void view()}>Consultar</Button>
      </div>
      {shown && <p className="text-sm font-semibold">{shown}</p>}
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Novo documento" className="max-w-xs" inputMode="text" autoCapitalize="characters" placeholder="Novo CPF ou CNPJ (correção)" value={fix} onChange={(e) => setFix(formatTaxIdInput(e.target.value))} />
        <Button variant="outline" disabled={!pick || !reasonOk || !taxIdKind(fix) || busy} onClick={() => void correct()}>Corrigir</Button>
      </div>
    </Card>
  );
}

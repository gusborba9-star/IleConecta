import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input } from "@/components/base";
import { supabase } from "@/lib/supabase";

type Row = { id: string; created_at: string; status: string; source: string; kind: string; detail: Record<string, unknown>; event_at: string; user_id: string; display_name: string | null; note: string | null };
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const KIND: Record<string, string> = {
  login_novo_aparelho: "Entrada em aparelho novo", conta_bloqueada: "Conta bloqueada por tentativas", senha_alterada: "Senha alterada", palavra_alterada: "Palavra de segurança alterada",
  recuperacao_pedida: "Pedido de recuperação de acesso", recuperacao_aprovada: "Troca de e-mail aprovada", email_alterado: "E-mail alterado",
};

/** Fila "Não fui eu": pessoas que disseram que não reconhecem um aviso de segurança. Só o dono vê e resolve. Nada aqui mostra senha ou e-mail. */
export default function AdminSecurityCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { if (!supabase) return; void supabase.rpc("admin_security_reports", { p_status: "aberto" }).then(({ data }) => setRows((data as Row[] | null) ?? [])); }, []);
  useEffect(load, [load]);
  const resolve = async (id: string) => {
    if (!supabase || busy) return;
    setBusy(id);
    const { error } = await supabase.rpc("admin_security_resolve", { p_id: id, p_note: note[id] ?? "" });
    setBusy("");
    if (error) return void toast.error("Não foi possível resolver agora.");
    toast.success("Marcado como resolvido."); load();
  };
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-display font-bold text-lg">Segurança: "Não fui eu"</h2>{rows && <Badge>{rows.length} em aberto</Badge>}</div>
      <p className="text-xs text-muted-foreground">Quem não reconhece um aviso de segurança aparece aqui. Abra a conta pelas ferramentas de suporte, confira e oriente a pessoa. Ninguém vê nem define senha.</p>
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido em aberto.</p>}
      <ul className="space-y-3">
        {rows?.map((r) => (
          <li key={r.id} className="border rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold">{r.display_name ?? "Conta"} · {KIND[r.kind] ?? r.kind}</p>
            <p className="text-xs text-muted-foreground">Aviso de {fmt(r.event_at)} · pedido em {fmt(r.created_at)} · {r.source === "app" ? "pelo app" : "pelo e-mail"}{r.kind === "login_novo_aparelho" && r.detail.label ? ` · ${String(r.detail.label)}` : ""}</p>
            <div className="flex gap-2"><Input aria-label="Anotação" placeholder="Anotação (opcional)" maxLength={500} value={note[r.id] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))} />
              <Button size="sm" disabled={busy === r.id} onClick={() => resolve(r.id)}>Resolvido</Button></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

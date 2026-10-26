import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { addAdmin, fetchAdmins, removeAdmin, type AdminRow } from "@/lib/adminUsers";

/** Quem pode administrar a plataforma. Mantenha pelo menos duas contas de confiança. */
export default function AdminUsers() {
  const { currentUser } = useApp();
  const { isAdmin } = usePlatformConfig();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setRows(await fetchAdmins()), []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const add = async () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    const r = await addAdmin(value);
    setBusy(false);
    if (r === "ok") {
      toast.success("Administrador adicionado.");
      setEmail("");
      void load();
    } else if (r === "user_not_found") toast.error("Não há conta com esse e-mail. A pessoa precisa se cadastrar primeiro.");
    else toast.error("Não foi possível adicionar.");
  };

  const remove = async (row: AdminRow) => {
    if (!window.confirm(`Remover o acesso de ${row.email}?`)) return;
    setBusy(true);
    const r = await removeAdmin(row.user_id);
    setBusy(false);
    if (r === "ok") {
      toast.success("Acesso removido.");
      void load();
    } else if (r === "last_admin") toast.error("Não é possível remover o último administrador.");
    else toast.error("Não foi possível remover.");
  };

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Administradores</h2>
      <p className="text-sm text-muted-foreground">
        Mantenha pelo menos duas contas de confiança, para não perder o acesso se algo acontecer com uma delas.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.user_id} className="flex items-center gap-3 text-sm border border-border rounded-xl px-3 py-2">
            <span className="flex-1 break-all">
              {r.email}
              {r.user_id === currentUser?.id && <span className="text-muted-foreground"> (você)</span>}
            </span>
            <Button variant="outline" size="sm" disabled={busy || rows.length <= 1} onClick={() => remove(r)}>
              Remover
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="email"
          aria-label="E-mail do novo administrador"
          placeholder="e-mail de uma conta já cadastrada"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button onClick={add} disabled={busy || !email.trim()}>Adicionar</Button>
      </div>
    </Card>
  );
}

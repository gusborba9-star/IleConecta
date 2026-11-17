import { useConfirm } from "@/components/base/Confirm";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { addAdmin, fetchAdmins, removeAdmin, setAdminPerms, type AdminRow } from "@/lib/adminUsers";
import { MODULES, OWNER_ONLY, togglePerm } from "@/lib/adminAccessCore";

function ModulePicker({ perms, onToggle, disabled, idPrefix }: { perms: string[]; onToggle: (key: string) => void; disabled?: boolean; idPrefix: string }) {
  return (
    <div role="group" aria-label="Módulos de acesso" className="grid gap-2">
      {MODULES.map((m) => (
        <label key={m.key} htmlFor={`${idPrefix}-${m.key}`} className="flex items-start gap-2 text-sm rounded-xl border border-border px-3 py-2 min-h-11 cursor-pointer">
          <input id={`${idPrefix}-${m.key}`} type="checkbox" className="mt-1 h-4 w-4" checked={perms.includes(m.key)} disabled={disabled} onChange={() => onToggle(m.key)} />
          <span><span className="font-semibold">{m.label}</span><span className="block text-xs text-muted-foreground">{m.desc}</span></span>
        </label>
      ))}
    </div>
  );
}

/** Equipe da administração: só o dono vê e muda. Cada pessoa recebe módulos; o dono tem poder sobre tudo. */
export default function AdminUsers() {
  const confirm = useConfirm();
  const { currentUser } = useApp();
  const { can } = usePlatformConfig();
  const owner = can("dono");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  const load = useCallback(async () => setRows(await fetchAdmins()), []);
  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);

  if (!owner) return null;

  const add = async () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    const r = await addAdmin(value, newPerms);
    setBusy(false);
    if (r === "ok") {
      toast.success("Pessoa adicionada à equipe.");
      setEmail("");
      setNewPerms([]);
      void load();
    } else if (r === "user_not_found") toast.error("Não há conta com esse e-mail. A pessoa precisa se cadastrar primeiro.");
    else toast.error("Não foi possível adicionar.");
  };

  const saveEdit = async (row: AdminRow) => {
    setBusy(true);
    const r = await setAdminPerms(row.userId, draft);
    setBusy(false);
    if (r === "ok") {
      toast.success("Módulos atualizados.");
      setEditing(null);
      void load();
    } else toast.error("Não foi possível salvar os módulos.");
  };

  const remove = async (row: AdminRow) => {
    if (!(await confirm({ title: "Tirar da equipe?", message: `${row.name || row.email} perde todo o acesso ao painel administrativo.`, confirmLabel: "Tirar", danger: true }))) return;
    setBusy(true);
    const r = await removeAdmin(row.userId);
    setBusy(false);
    if (r === "ok") {
      toast.success("Acesso removido.");
      void load();
    } else if (r === "owner") toast.error("O dono não pode ser removido.");
    else toast.error("Não foi possível remover.");
  };

  const label = (key: string) => MODULES.find((m) => m.key === key)?.label ?? key;

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Equipe da administração</h2>
      <p className="text-sm text-muted-foreground">Dê a cada pessoa só os módulos de que ela precisa. {OWNER_ONLY}</p>
      <ul className="space-y-2" aria-label="Equipe">
        {rows.map((r) => (
          <li key={r.userId} className="border border-border rounded-xl px-3 py-2 pillow text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-0 break-words">
                <span className="font-semibold">{r.name || r.email}</span>
                {r.name && <span className="text-muted-foreground"> · {r.email}</span>}
                {r.userId === currentUser?.id && <span className="text-muted-foreground"> (você)</span>}
              </span>
              {r.owner ? <Badge tone="primary">Dono</Badge> : (
                <>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(editing === r.userId ? null : r.userId); setDraft(r.perms); }}>{editing === r.userId ? "Fechar" : "Módulos"}</Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => remove(r)}>Tirar</Button>
                </>
              )}
            </div>
            {!r.owner && editing !== r.userId && (
              <div className="flex flex-wrap gap-1">
                {r.perms.length === 0 ? <span className="text-xs text-muted-foreground">Sem nenhum módulo (não consegue usar o painel).</span> : r.perms.map((p) => <Badge key={p} tone="muted">{label(p)}</Badge>)}
              </div>
            )}
            {editing === r.userId && !r.owner && (
              <div className="space-y-2">
                <ModulePicker perms={draft} onToggle={(k) => setDraft((d) => togglePerm(d, k))} disabled={busy} idPrefix={`m-${r.userId}`} />
                <Button size="sm" disabled={busy} onClick={() => saveEdit(r)}>Salvar módulos</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="font-semibold text-sm">Adicionar pessoa</h3>
        <Input type="email" aria-label="E-mail da nova pessoa da equipe" placeholder="e-mail de uma conta já cadastrada" value={email} onChange={(e) => setEmail(e.target.value)} />
        <ModulePicker perms={newPerms} onToggle={(k) => setNewPerms((d) => togglePerm(d, k))} disabled={busy} idPrefix="m-novo" />
        <Button onClick={add} disabled={busy || !email.trim()}>Adicionar à equipe</Button>
      </div>
    </Card>
  );
}

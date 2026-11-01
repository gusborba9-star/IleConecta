import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import { Button, Card, Input, Label, Textarea } from "@/components/base";
import { fetchAdminDocs, saveAdminDoc, type AdminDoc } from "@/lib/adminDocs";
import { DOC_BODY_MAX, DOC_TITLE_MAX, parseBlocks, parseInline, slugify, validateDoc, type DocBlock } from "@/lib/docsCore";
import { cn } from "@/lib/utils";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        p.t === "b" ? <strong key={i}>{p.v}</strong> : p.t === "code" ? <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{p.v}</code> : <Fragment key={i}>{p.v}</Fragment>
      )}
    </>
  );
}

function Block({ b }: { b: DocBlock }): ReactNode {
  if (b.type === "h") {
    const cls = b.level === 1 ? "font-display font-bold text-2xl mt-2" : b.level === 2 ? "font-display font-bold text-lg mt-4" : "font-semibold mt-3";
    return <div role="heading" aria-level={b.level} className={cls}><Inline text={b.text} /></div>;
  }
  if (b.type === "hr") return <hr className="border-border" />;
  if (b.type === "p") return <p className="text-sm leading-relaxed"><Inline text={b.text} /></p>;
  if (b.type === "list") {
    return (
      <div className="space-y-1">
        {b.items.map((it, i) => (
          <div key={i} className="flex gap-2 text-sm leading-relaxed" style={{ marginLeft: it.depth * 18 }}>
            <span className="shrink-0 text-muted-foreground w-5 text-right">{it.marker}</span>
            <span><Inline text={it.text} /></span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr>{b.head.map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold align-top"><Inline text={h} /></th>)}</tr></thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top"><Inline text={c} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Documentos da plataforma: o dono lê e edita as regras do Ilê Conecta. Cada gravação fica no histórico. */
export default function AdminDocs() {
  const [docs, setDocs] = useState<AdminDoc[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const open = useCallback((d: AdminDoc | undefined) => {
    setSlug(d?.slug ?? null);
    setTitle(d?.title ?? "");
    setBody(d?.body ?? "");
    setEditing(false);
    setCreating(false);
  }, []);

  const load = useCallback(async (keep?: string | null) => {
    const list = await fetchAdminDocs();
    setDocs(list);
    open(list.find((d) => d.slug === keep) ?? list[0]);
  }, [open]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = docs?.find((d) => d.slug === slug);
  const dirty = creating || (current ? current.title !== title || current.body !== body : false);
  const blocks = useMemo(() => parseBlocks(body), [body]);

  const startNew = () => {
    setCreating(true);
    setEditing(true);
    setSlug(null);
    setTitle("");
    setBody("");
  };

  const save = async () => {
    const v = validateDoc({ title, body });
    if (!v.ok) return void toast.error(v.error);
    const target = creating ? slugify(v.title) : slug;
    if (!target) return void toast.error("O título precisa ter letras ou números.");
    if (creating && docs?.some((d) => d.slug === target)) return void toast.error("Já existe um documento com esse título.");
    setSaving(true);
    const ok = await saveAdminDoc(target, v.title, v.body);
    setSaving(false);
    if (!ok) return void toast.error("Não foi possível salvar.");
    toast.success("Documento salvo. A versão anterior ficou no histórico.");
    await load(target);
  };

  if (docs === null) return <Card className="p-5 text-sm text-muted-foreground">Carregando…</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="font-display font-bold text-2xl">Documentos</h1>
          </div>
          <Button variant="outline" onClick={startNew}><Plus className="h-4 w-4" /> Novo</Button>
        </div>
        <p className="text-sm text-muted-foreground">As regras do Ilê Conecta ficam aqui. Você edita e salva na hora; cada versão anterior fica registrada no histórico.</p>
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {docs.map((d) => (
              <button
                key={d.slug}
                onClick={() => open(d)}
                aria-current={!creating && slug === d.slug ? "page" : undefined}
                className={cn("min-h-11 rounded-xl px-3 text-sm font-semibold border transition", !creating && slug === d.slug ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted")}
              >
                {d.title}
              </button>
            ))}
          </div>
        )}
      </Card>

      {docs.length === 0 && !creating && <Card className="p-5 text-sm text-muted-foreground">Nenhum documento ainda. Toque em Novo para criar.</Card>}

      {(current || creating) && (
        <Card className="p-5 space-y-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="doc-title">Título</Label>
                <Input id="doc-title" value={title} maxLength={DOC_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="doc-body">Texto</Label>
                <Textarea id="doc-body" value={body} rows={22} className="font-mono text-sm" onChange={(e) => setBody(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">
                  Use # para títulos, - para listas, **negrito** e tabelas com |. {body.length.toLocaleString("pt-BR")} de {DOC_BODY_MAX.toLocaleString("pt-BR")} caracteres.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={save} disabled={saving || !dirty}>{saving ? "Salvando…" : "Salvar"}</Button>
                <Button variant="outline" disabled={saving} onClick={() => (creating ? open(docs[0]) : open(current))}>Descartar</Button>
              </div>
              {blocks.length > 0 && (
                <div className="border-t border-border pt-3 space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground">Como vai aparecer</div>
                  {blocks.map((b, i) => <Block key={i} b={b} />)}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Atualizado em {current ? new Date(current.updatedAt).toLocaleString("pt-BR") : ""}</div>
                <Button variant="outline" onClick={() => setEditing(true)}>Editar</Button>
              </div>
              {blocks.map((b, i) => <Block key={i} b={b} />)}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Input, Label, Textarea } from "@/components/base";
import MoneyInput from "@/components/base/MoneyInput";
import {
  CATALOG_MAX_ITEMS, addCatalogItem, centsToInput, deleteCatalogItem, fetchCatalog, parsePriceToCents, updateCatalogItem,
  type CatalogItem,
} from "@/lib/catalog";

interface Draft {
  name: string;
  description: string;
  price: string;
  showPrice: boolean;
}
const EMPTY: Draft = { name: "", description: "", price: "", showPrice: false };

/** Catálogo privado da casa: trabalhos ocasionais e valores que só a assistente enxerga (não aparece na página). */
export default function InternalCatalog({ houseId }: { houseId: string }) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchCatalog(houseId).then((r) => alive && setItems(r));
    return () => {
      alive = false;
    };
  }, [houseId]);

  if (!items) return <p className="text-sm text-muted-foreground">Carregando catálogo…</p>;

  const add = async () => {
    const price = parsePriceToCents(draft.price);
    if (draft.name.trim().length < 2) return void toast.error("Dê um nome ao trabalho.");
    if (price === undefined) return void toast.error("Valor inválido. Use por exemplo 200,00.");
    setBusy(true);
    const created = await addCatalogItem(houseId, {
      name: draft.name, description: draft.description, priceCents: price, showPrice: draft.showPrice, mode: "combinar", active: true,
    });
    setBusy(false);
    if (!created) return void toast.error("Não foi possível adicionar. Tente novamente.");
    setItems([...items, created]);
    setDraft(EMPTY);
  };

  const change = async (item: CatalogItem, patch: Partial<CatalogItem>) => {
    const next = { ...item, ...patch };
    setItems(items.map((i) => (i.id === item.id ? next : i)));
    if (!(await updateCatalogItem(next))) {
      setItems(items);
      toast.error("Não foi possível salvar a alteração.");
    }
  };

  const remove = async (item: CatalogItem) => {
    if (!(await deleteCatalogItem(item.id))) return void toast.error("Não foi possível remover.");
    setItems(items.filter((i) => i.id !== item.id));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-4">
      <div>
        <h3 className="font-semibold">Catálogo interno (privado)</h3>
        <p className="text-xs text-muted-foreground">
          Trabalhos que a casa faz sob procura e valores de referência. Não aparece na sua página: serve só para a assistente atender. Ela só diz o valor quando você marcar a opção; a casa sempre combina horário e fecha.
        </p>
      </div>

      {items.map((i) => (
        <div key={i.id} className="rounded-md bg-muted/40 p-3 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="flex-1 min-w-0 break-words">{i.name}</strong>
            {i.priceCents !== null && <span className="font-semibold">R$ {centsToInput(i.priceCents)}</span>}
            {!i.active && <Badge tone="muted">Pausado</Badge>}
          </div>
          {i.description && <p className="text-muted-foreground">{i.description}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {i.priceCents !== null && (
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={i.showPrice} onChange={(e) => void change(i, { showPrice: e.target.checked })} />
                Assistente pode informar o valor
              </label>
            )}
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={i.active} onChange={(e) => void change(i, { active: e.target.checked })} />
              Ativo
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => void remove(i)}>Remover</Button>
          </div>
        </div>
      ))}

      {items.length < CATALOG_MAX_ITEMS && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
            <div>
              <Label htmlFor="cat-name">Trabalho</Label>
              <Input id="cat-name" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ex.: Limpeza espiritual" />
            </div>
            <div>
              <Label htmlFor="cat-price">Valor (R$)</Label>
              <MoneyInput id="cat-price" value={draft.price} onValueChange={(v) => setDraft({ ...draft, price: v })} placeholder="277,00" />
            </div>
          </div>
          <div>
            <Label htmlFor="cat-desc">Explicação para a assistente (opcional)</Label>
            <Textarea id="cat-desc" rows={2} maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Como funciona, o que o cliente precisa saber…" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!draft.price.trim()} checked={draft.showPrice} onChange={(e) => setDraft({ ...draft, showPrice: e.target.checked })} />
            A assistente pode informar este valor ao cliente
          </label>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void add()}>{busy ? "Adicionando…" : "Adicionar ao catálogo"}</Button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/base";
import StyledPostBody from "@/components/feed/StyledPostBody";
import LettersPicker from "@/components/feed/LettersPicker";
import { fitToMode, scrimPctFor } from "@/lib/postLettersCore";
import { CARD_MODES, CARD_TEXT_MAX, type CardMode } from "@/lib/postCardCore";
import { prepareCardImage } from "@/lib/postImages";
import type { StyleDraft } from "@/components/feed/postStyleDraft";
import { toast } from "sonner";


/**
 * Escolha do card da publicação (normal, imagem no card todo, imagem em parte) com prévia ao vivo.
 * Quem não tem a ferramenta no plano vê as opções com cadeado e o caminho para os planos (o banco confere de novo).
 */
export default function PostStylePicker({ value, onChange, text, allowed, houseName }: { value: StyleDraft; onChange: (v: StyleDraft) => void; text: string; allowed: boolean; houseName: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const urlRef = useRef<string | null>(null);
  useEffect(() => { urlRef.current = value.image?.previewUrl ?? null; }, [value.image]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const r = await prepareCardImage(f);
    setBusy(false);
    if (r.ok === false) { toast.error(r.error); return; }
    if (value.image) URL.revokeObjectURL(value.image.previewUrl);
    onChange({ ...value, image: r.image });
  };
  const setMode = (mode: CardMode) => onChange({ ...value, mode, letters: fitToMode(value.letters, mode) });
  const styled = value.mode !== "normal";

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Como a publicação aparece</legend>
      <div role="radiogroup" aria-label="Estilo do card" className="grid gap-2 sm:grid-cols-3">
        {CARD_MODES.map((m) => {
          const locked = m.id !== "normal" && !allowed;
          const on = value.mode === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => setMode(m.id)}
              className={`text-left rounded-xl border px-3 py-2 min-h-11 text-sm transition ${on ? "border-primary bg-primary/10" : "border-border"} ${locked ? "opacity-60 cursor-not-allowed" : "hover:bg-muted"}`}>
              <span className="flex items-center gap-1 font-semibold">{locked && <Lock className="h-3.5 w-3.5" aria-hidden />}{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </button>
          );
        })}
      </div>
      {!allowed && (
        <p className="text-xs text-muted-foreground">
          <strong>Posts com a cara da sua casa</strong>: use a foto do seu templo ou altar como fundo da publicação. Disponível a partir do plano Profissional.{" "}
          <Link to="/planos" className="text-primary font-semibold">Ver planos</Link>
        </p>
      )}
      {styled && allowed && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto do card" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Lendo a foto…" : value.image ? "Trocar a foto" : "Escolher a foto do card"}</Button>
            <span className={`text-xs ${text.length > CARD_TEXT_MAX ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{text.length}/{CARD_TEXT_MAX} caracteres no card</span>
          </div>
          {value.image ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Prévia: assim vai aparecer no feed, de {houseName}</div>
              <div className="rounded-xl overflow-hidden border border-border" data-testid="card-preview">
                <StyledPostBody text={text.trim() || "O texto da sua publicação aparece aqui."} card={{ style: value.mode as "total" | "parcial", image: value.image.previewUrl, scrimPct: value.mode === "total" ? scrimPctFor(value.image.brightness, value.letters.color) : value.image.scrimPct, letters: value.letters }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Escolha uma foto (JPG, PNG ou WebP, até 5 MB) para ver a prévia.</p>
          )}
          {value.image && <LettersPicker mode={value.mode} value={value.letters} onChange={(letters) => onChange({ ...value, letters })} />}
          <label className="flex items-start gap-2 text-sm min-h-11">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={value.ack} onChange={(e) => onChange({ ...value, ack: e.target.checked })} />
            <span>Tenho o direito de usar esta imagem (foto minha, da casa ou com autorização de quem a fez).</span>
          </label>
        </div>
      )}
    </fieldset>
  );
}

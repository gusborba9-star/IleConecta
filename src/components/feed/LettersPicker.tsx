import { Bold, Italic, RotateCcw } from "lucide-react";
import { ALIGNS, FONTS, POSITIONS, SIZES, colorsFor, fitToMode, isDefaultLetters, EMPTY_LETTERS, type Letters } from "@/lib/postLettersCore";
import type { CardMode } from "@/lib/postCardCore";
import "@/lib/postFonts";

const chip = (on: boolean) => `rounded-xl border px-3 py-2 min-h-11 text-sm transition ${on ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`;

/** "Letras com a sua identidade": a casa escolhe fonte, tamanho, cor, alinhamento e posição das letras, vendo o resultado na prévia. Só lista o que combina com o modo. */
export default function LettersPicker({ mode, value, onChange }: { mode: CardMode; value: Letters; onChange: (l: Letters) => void }) {
  const set = (patch: Partial<Letters>) => onChange(fitToMode({ ...value, ...patch }, mode));
  const colors = colorsFor(mode);
  const toggle = <K extends keyof Letters>(k: K, v: Letters[K]) => set({ [k]: value[k] === v ? null : v } as Partial<Letters>);
  return (
    <fieldset className="space-y-3" data-testid="letters-picker">
      <legend className="text-sm font-semibold">Letras com a sua identidade</legend>
      <p className="text-xs text-muted-foreground -mt-1">Dê à publicação o jeito da sua casa. O texto continua sempre legível: o sistema ajusta o fundo atrás das letras.</p>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">Fonte</div>
        <div role="radiogroup" aria-label="Fonte das letras" className="flex flex-wrap gap-2">
          {FONTS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={value.font === f.id} onClick={() => toggle("font", f.id)} className={chip(value.font === f.id)} style={{ fontFamily: f.family }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">Tamanho</div>
        <div role="radiogroup" aria-label="Tamanho das letras" className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={value.size === s.id} onClick={() => toggle("size", s.id)} className={chip(value.size === s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">Cor {mode === "parcial" ? "(sobre o papel claro do card)" : "(sobre a foto)"}</div>
        <div role="radiogroup" aria-label="Cor das letras" className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={value.color === c.id} aria-label={c.label} title={c.label} onClick={() => toggle("color", c.id)}
              className={`h-11 w-11 rounded-full border-2 transition ${value.color === c.id ? "border-primary ring-2 ring-primary/40" : "border-border"}`} style={{ background: c.hex }} />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">Alinhamento</div>
        <div role="radiogroup" aria-label="Alinhamento das letras" className="flex flex-wrap gap-2">
          {ALIGNS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={value.align === a.id} onClick={() => toggle("align", a.id)} className={chip(value.align === a.id)}>{a.label}</button>
          ))}
        </div>
      </div>

      {mode === "total" && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">Posição do texto na foto</div>
          <div role="radiogroup" aria-label="Posição do texto" className="flex flex-wrap gap-2">
            {POSITIONS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={value.pos === p.id} onClick={() => toggle("pos", p.id)} className={chip(value.pos === p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={value.bold} aria-label="Negrito" onClick={() => set({ bold: !value.bold })} className={`${chip(value.bold)} inline-flex items-center gap-1`}><Bold className="h-4 w-4" aria-hidden /> Negrito</button>
        <button type="button" aria-pressed={value.italic} aria-label="Itálico" onClick={() => set({ italic: !value.italic })} className={`${chip(value.italic)} inline-flex items-center gap-1`}><Italic className="h-4 w-4" aria-hidden /> Itálico</button>
        {!isDefaultLetters(value) && (
          <button type="button" onClick={() => onChange(EMPTY_LETTERS)} className="rounded-xl px-3 py-2 min-h-11 text-sm text-muted-foreground hover:bg-muted inline-flex items-center gap-1"><RotateCcw className="h-4 w-4" aria-hidden /> Voltar ao padrão</button>
        )}
      </div>
    </fieldset>
  );
}

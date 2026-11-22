import { useState, type CSSProperties } from "react";
import { SCRIM_MAX, SCRIM_MIN } from "@/lib/postCardCore";
import { PAPER, lettersLook, type Letters } from "@/lib/postLettersCore";
import "@/lib/postFonts";

export interface StyledCard { style: "total" | "parcial"; image: string; scrimPct: number; letters?: Letters }

const ALIGN: Record<string, string> = { esq: "text-left", centro: "text-center", dir: "text-right" };
const POS: Record<string, string> = { topo: "items-start", meio: "items-center", base: "items-end" };

/** Letras escolhidas pela casa → estilo do texto. Sem escolha, devolve nada e o card fica como sempre foi. */
function textStyle(look: ReturnType<typeof lettersLook>, base: CSSProperties): CSSProperties {
  const s: CSSProperties = { ...base };
  if (look.family) s.fontFamily = look.family;
  if (look.fontSizePx) { s.fontSize = `${look.fontSizePx}px`; s.lineHeight = 1.5; }
  if (look.weight) s.fontWeight = look.weight;
  if (look.italic) s.fontStyle = "italic";
  if (look.color) s.color = look.color;
  return s;
}

/**
 * "Posts com a cara da sua casa": o corpo do post com foto. O texto continua texto (selecionável, lido por leitores de tela);
 * quem garante a leitura é um fundo escuro uniforme atrás das letras (força calculada pelo brilho da foto e pela cor das letras) e uma sombra leve no texto.
 * É o mesmo componente da prévia e do feed, então o que a casa vê antes de publicar é exatamente o que as pessoas veem.
 */
export default function StyledPostBody({ text, card }: { text: string; card: StyledCard }) {
  // A foto se ajusta sozinha: o card toma o formato dela (de 4:5 a 1,91:1); só passando disso há corte.
  const [ratio, setRatio] = useState(16 / 9);
  const a = Math.min(SCRIM_MAX, Math.max(SCRIM_MIN, card.scrimPct / 100));
  const look = lettersLook(card.letters, card.style);
  if (card.style === "parcial") {
    // com cor escolhida o texto fica sobre um papel claro fixo (cores escuras leem bem nele, no tema claro e no escuro)
    const paper = look.color !== null;
    return (
      <div data-card="parcial">
        <div className="border-y border-border bg-muted">
          <img src={card.image} alt="" loading="lazy" decoding="async" style={{ aspectRatio: String(ratio) }} className="w-full object-cover"
            onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w > 0 && h > 0) setRatio(Math.min(1.91, Math.max(0.8, w / h))); }} />
        </div>
        <div className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${look.align ? ALIGN[look.align] : ""}`} style={textStyle(look, paper ? { background: PAPER } : {})} data-letters={look.custom ? "1" : undefined}>{text}</div>
      </div>
    );
  }
  const veil: CSSProperties = { background: `rgba(0,0,0,${a})` };
  return (
    <div data-card="total" className={`relative isolate overflow-hidden min-h-[300px] sm:min-h-[360px] flex ${look.pos ? POS[look.pos] : "items-end"} bg-neutral-900`}>
      <img src={card.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10" style={veil} />
      <p className={`relative w-full px-5 py-6 sm:px-7 text-[17px] sm:text-lg leading-relaxed font-medium text-white whitespace-pre-wrap break-words ${look.align ? ALIGN[look.align] : ""}`} style={textStyle(look, { textShadow: "0 1px 3px rgba(0,0,0,.65)" })} data-letters={look.custom ? "1" : undefined}>
        {text}
      </p>
    </div>
  );
}

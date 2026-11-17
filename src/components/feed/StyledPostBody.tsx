import type { CSSProperties } from "react";
import { SCRIM_MAX, SCRIM_MIN } from "@/lib/postCardCore";

export interface StyledCard { style: "total" | "parcial"; image: string; scrimPct: number }

/**
 * "Posts com a cara da sua casa": o corpo do post com foto. O texto continua texto (selecionável, lido por leitores de tela);
 * quem garante a leitura é um fundo escuro uniforme atrás das letras (força calculada pelo brilho da foto) e uma sombra leve no texto.
 * É o mesmo componente da prévia e do feed, então o que a casa vê antes de publicar é exatamente o que as pessoas veem.
 */
export default function StyledPostBody({ text, card }: { text: string; card: StyledCard }) {
  const a = Math.min(SCRIM_MAX, Math.max(SCRIM_MIN, card.scrimPct / 100));
  if (card.style === "parcial") {
    return (
      <div data-card="parcial">
        <div className="border-y border-border bg-muted">
          <img src={card.image} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover" />
        </div>
        <div className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{text}</div>
      </div>
    );
  }
  const veil: CSSProperties = { background: `rgba(0,0,0,${a})` };
  return (
    <div data-card="total" className="relative isolate overflow-hidden min-h-[300px] sm:min-h-[360px] flex items-end bg-neutral-900">
      <img src={card.image} alt="" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10" style={veil} />
      <p className="relative w-full px-5 py-6 sm:px-7 text-[17px] sm:text-lg leading-relaxed font-medium text-white whitespace-pre-wrap break-words" style={{ textShadow: "0 1px 3px rgba(0,0,0,.65)" }}>
        {text}
      </p>
    </div>
  );
}

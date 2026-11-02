import { useState, type ReactNode } from "react";
import { MessageCircle, type LucideIcon } from "lucide-react";
import { SEGMENTS, type SegmentId } from "@/lib/cardsCore";

export interface OfferInfo {
  icon: LucideIcon;
  text: string;
}

interface Props {
  segment: SegmentId;
  typeLabel: string;
  typeIcon: LucideIcon;
  chip?: { text: string; icon?: LucideIcon };
  title: string;
  description?: string | null;
  dateTile?: { month: string; day: string };
  info: OfferInfo[];
  slots?: { iso: string; label: string }[];
  selectedSlot?: string;
  onPickSlot?: (iso: string) => void;
  price: string;
  priceNote: string;
  primary?: { label: string; onClick: () => void };
  hint?: string;
  chat: { onClick: () => void; status: string; label?: string };
  /** Conteúdo extra no fim (ex.: aviso de pedido). */
  children?: ReactNode;
}

/** Card de oferta da casa visto pelo cliente: tom por segmento, descrição, informações, preço e um botão principal. */
export default function OfferCard({ segment, typeLabel, typeIcon: TypeIcon, chip, title, description, dateTile, info, slots, selectedSlot, onPickSlot, price, priceNote, primary, hint, chat, children }: Props) {
  const t = SEGMENTS[segment];
  const [open, setOpen] = useState(false);
  const long = (description?.length ?? 0) > 220;
  const ChipIcon = chip?.icon;
  return (
    <article
      className="rounded-3xl p-5 flex flex-col gap-3.5"
      style={{ background: t.bg, boxShadow: `inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 1px ${t.border}, 0 14px 28px -14px ${t.glow}, 0 2px 6px rgba(60,40,20,.06)` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-full bg-white/75 text-xs font-bold uppercase tracking-wider" style={{ color: t.accent }}>
          <TypeIcon className="h-4 w-4" aria-hidden="true" />{typeLabel}
        </span>
        {chip && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold" style={{ color: t.accent, background: `${t.accent}1F` }}>
            {ChipIcon && <ChipIcon className="h-3.5 w-3.5" aria-hidden="true" />}{chip.text}
          </span>
        )}
      </div>

      <h3 className="font-display font-bold text-[26px] leading-tight text-[#2A1B10]">{title}</h3>
      {description && (
        <div>
          <p className="text-[15px] leading-relaxed text-[#5A4A3E] whitespace-pre-line" style={open || !long ? undefined : { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{description}</p>
          {long && <button type="button" className="mt-1 min-h-8 text-sm font-bold" style={{ color: t.accent }} onClick={() => setOpen((v) => !v)}>{open ? "Ler menos" : "Ler mais"}</button>}
        </div>
      )}

      <div className="flex items-center gap-3.5">
        {dateTile && (
          <div className="w-16 h-[68px] shrink-0 rounded-2xl bg-white flex flex-col items-center justify-center" style={{ boxShadow: `0 0 0 1px ${t.border}, 0 4px 10px -6px ${t.glow}` }}>
            <span className="text-[11px] font-bold tracking-widest" style={{ color: t.accent }}>{dateTile.month}</span>
            <span className="font-display font-bold text-[26px] leading-none text-[#2A1B10]">{dateTile.day}</span>
          </div>
        )}
        <ul className="flex flex-col gap-1.5 text-sm font-semibold text-[#3B2C20]">
          {info.map((i) => (
            <li key={i.text} className="flex items-center gap-2"><i.icon className="h-[18px] w-[18px] shrink-0" style={{ color: t.accent }} aria-hidden="true" />{i.text}</li>
          ))}
        </ul>
      </div>

      {slots && slots.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: t.accent }}>Próximos horários livres</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Horários livres">
            {slots.map((s) => {
              const on = selectedSlot === s.iso;
              return (
                <button key={s.iso} type="button" aria-pressed={on} onClick={() => onPickSlot?.(on ? "" : s.iso)}
                  className="min-h-11 px-3 rounded-xl text-[13px] font-bold transition"
                  style={on ? { background: t.accent, color: "#fff", boxShadow: `0 0 0 1px ${t.accent}` } : { background: "#fff", color: t.accent, boxShadow: `0 0 0 1px ${t.border}` }}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-auto h-px bg-[rgba(60,40,20,.14)]" />
      <div className="flex items-baseline justify-between">
        <span className="font-display font-bold text-[30px] leading-none text-[#2A1B10]">{price}</span>
        <span className="text-[13px] font-semibold text-[#6B5A4D]">{priceNote}</span>
      </div>

      {primary && (
        <button type="button" onClick={primary.onClick} className="w-full h-[52px] rounded-2xl text-base font-bold text-white"
          style={{ background: t.accent, boxShadow: `0 8px 16px -8px ${t.accent}` }}>
          {primary.label}
        </button>
      )}
      {hint && <p className="text-center text-[13px] leading-snug text-[#5A4A3E]">{hint}</p>}
      {primary ? (
        <button type="button" onClick={chat.onClick} className="flex items-center justify-center gap-2 min-h-11 text-sm font-bold" style={{ color: t.accent }}>
          <MessageCircle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="text-center">Dúvidas? Conversar{chat.status && <span className="font-semibold text-[#6B5A4D]"> · {chat.status}</span>}</span>
        </button>
      ) : (
        <button type="button" onClick={chat.onClick} className="w-full h-[52px] rounded-2xl text-base font-bold bg-white flex items-center justify-center gap-2" style={{ color: t.accent, boxShadow: `0 0 0 1.5px ${t.accent}` }}>
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />{chat.label ?? "Conversar"}
        </button>
      )}
      {!primary && chat.status && <p className="text-center text-[13px] text-[#6B5A4D] -mt-1.5">{chat.status.charAt(0).toUpperCase() + chat.status.slice(1)}</p>}
      {children}
    </article>
  );
}

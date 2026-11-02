import { Link } from "react-router-dom";
import { CalendarDays, Camera, Check, Users } from "lucide-react";
import type { ReactNode } from "react";

export type ShowcaseKind = "members" | "calendar" | "chat";

const COPY: Record<ShowcaseKind, { eyebrow: string; title: string; points: string[]; icon: typeof Users }> = {
  members: {
    eyebrow: "Área de membros",
    title: "Saiba quem está em dia, sem planilha",
    points: [
      "Mensalidades e vencimentos de cada membro num só lugar",
      "Convite por link e aviso de cobrança, sem constrangimento",
      "Resumo do que entra neste mês e do que está em atraso",
    ],
    icon: Users,
  },
  calendar: {
    eyebrow: "Calendário completo",
    title: "Cada data para o público certo",
    points: [
      "Escolha quem vê cada data: público, seguidores ou só a casa",
      "Datas que se repetem todo ano, sem cadastrar de novo",
      "Sugestões de datas para começar em minutos",
    ],
    icon: CalendarDays,
  },
  chat: {
    eyebrow: "Fotos e vídeos no chat",
    title: "Mostre e receba o que as palavras não alcançam",
    points: [
      "Receba fotos e vídeos curtos de quem procura a casa",
      "Envie o resultado de um trabalho com imagem",
      "Tudo fica protegido na conversa, com sigilo",
    ],
    icon: Camera,
  },
};

function Sample({ kind }: { kind: ShowcaseKind }): ReactNode {
  if (kind === "members")
    return (
      <div className="space-y-2">
        {[["Paulo A.", "Atrasada · 6 dias", "bg-[#FCE8E6] text-[#B3261E]"], ["Ana C.", "Vence em 2 dias", "bg-[#FBF2DE] text-[#8A520C]"], ["Rui M.", "Em dia", "bg-[#E8F1EA] text-[#1F5B43]"]].map(([n, s, c]) => (
          <div key={n} className="flex items-center justify-between rounded-xl bg-white/90 px-3 py-2 text-sm text-[#2B1A10]">
            <span className="font-semibold">{n}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c}`}>{s}</span>
          </div>
        ))}
      </div>
    );
  if (kind === "calendar")
    return (
      <div className="space-y-2">
        {[["NOV", "07", "Encontro aberto", "Público", "bg-[#FBF2DE]"], ["NOV", "14", "Festividade da casa", "Seguidores", "bg-[#E8F1EA]"], ["NOV", "21", "Estudo interno", "Só a casa", "bg-[#EEE9F5]"]].map(([m, d, t, v, bg]) => (
          <div key={d} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[#2B1A10] ${bg}`}>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-center leading-none shadow-sm">
              <span><span className="block text-[9px] font-bold tracking-widest text-[#8A520C]">{m}</span><span className="block font-display text-base font-bold">{d}</span></span>
            </div>
            <div className="min-w-0 text-sm"><div className="truncate font-semibold">{t}</div><div className="text-[11px] opacity-70">{v}</div></div>
          </div>
        ))}
      </div>
    );
  return (
    <div className="space-y-2 text-sm">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-white/90 px-3 py-2 text-[#2B1A10]">Mãe, segue a foto do que a senhora pediu.</div>
      <div className="ml-auto grid h-24 w-40 place-items-center rounded-2xl rounded-br-md bg-gradient-to-br from-[#1F7A5C] to-[#0F3B2D] text-white ring-1 ring-[#E3BF5A]/60"><Camera className="h-6 w-6 text-[#E3BF5A]" /></div>
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[#14543F] px-3 py-2 text-white">Recebi, obrigada. Já te respondo.</div>
    </div>
  );
}

/** Vitrine do Premium: mostra o resultado que a casa ganha, em vez de explicar como usar. */
export default function PremiumShowcase({ kind, compact = false }: { kind: ShowcaseKind; compact?: boolean }) {
  const c = COPY[kind];
  const Icon = c.icon;
  return (
    <section aria-label={`${c.eyebrow}: disponível no plano Premium`} className="relative overflow-hidden rounded-[24px] text-white shadow-altar ring-1 ring-[#E3BF5A]/50" style={{ background: "linear-gradient(135deg,#14543F 0%,#0F3B2D 100%)" }}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #F4DC92 1px, transparent 0)", backgroundSize: "24px 24px" }} />
      <div className={`relative grid gap-5 p-5 sm:p-6 ${compact ? "" : "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center"}`}>
        <div>
          <span className="sheen inline-flex items-center gap-1.5 rounded-full bg-[#E3BF5A] px-3 py-1 text-xs font-bold text-[#2B1A10]"><Icon className="h-3.5 w-3.5" /> Premium</span>
          <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#E3BF5A]">{c.eyebrow}</div>
          <h2 className="mt-1 font-display text-2xl font-bold leading-tight">{c.title}</h2>
          <ul className="mt-4 space-y-2 text-sm text-white/85">
            {c.points.map((p) => (
              <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E3BF5A]" />{p}</li>
            ))}
          </ul>
          <Link to="/planos" className="mt-5 inline-flex h-11 items-center rounded-[14px] bg-gradient-to-b from-[#EDC96F] to-[#E3BF5A] px-5 text-sm font-semibold text-[#2B1A10] shadow-btn transition hover:brightness-105">Conhecer o Premium</Link>
        </div>
        {!compact && (
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15" aria-hidden>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#E3BF5A]">Exemplo</div>
            <Sample kind={kind} />
          </div>
        )}
      </div>
    </section>
  );
}

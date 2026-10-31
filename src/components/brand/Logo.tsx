import { useId } from "react";
import { cn } from "@/lib/utils";

/** Marca do Ilê Conecta: quatro folhas em cruz ligadas por uma rede, com um nó no centro.
 *  Esmeralda no tema claro e dourada no escuro (troca sozinha com o tema). */
function BareMark({ size = 36, ring = false, gold = false, className }: { size?: number; ring?: boolean; gold?: boolean; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const sw = ring ? 11 : 14;
  const tips = [-45, 45, 135, 225].map((a) => [256 + 158 * Math.cos((a * Math.PI) / 180), 256 + 158 * Math.sin((a * Math.PI) / 180)]);
  const w = 158 * 0.34;
  const drawing = (stroke: string, dot: string) => (
    <>
      {ring && <circle cx="256" cy="256" r="214" fill="none" stroke={stroke} strokeWidth={sw * 0.7} />}
      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${tips.map((t) => `${t[0].toFixed(1)} ${t[1].toFixed(1)}`).join("L")}Z`} strokeWidth={sw * 0.4} opacity={0.7} />
        <g strokeWidth={sw}>
          {[-45, 45, 135, 225].map((a) => (
            <g key={a} transform={`translate(256 256) rotate(${a})`}>
              <path d={`M0 0C${158 * 0.22} ${-w} ${158 * 0.72} ${-w * 0.85} 158 0C${158 * 0.72} ${w * 0.85} ${158 * 0.22} ${w} 0 0Z`} />
            </g>
          ))}
        </g>
      </g>
      <g fill={stroke}>{tips.map((t, i) => <circle key={i} cx={t[0]} cy={t[1]} r={sw * 1.05} />)}</g>
      <circle cx="256" cy="256" r={sw * 1.7} fill={dot} />
    </>
  );
  const viewBox = ring ? "0 0 512 512" : "70 70 372 372";
  const goldSvg = (cls: string) => (
    <svg width={size} height={size} viewBox={viewBox} role="img" aria-label="Ilê Conecta" className={cls}>
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4DC92" />
          <stop offset="1" stopColor="#C99A2E" />
        </linearGradient>
      </defs>
      {drawing(`url(#g${gid})`, "#FFF3C4")}
    </svg>
  );
  if (gold) return goldSvg(cn("shrink-0", className));
  return (
    <>
      <svg width={size} height={size} viewBox={viewBox} role="img" aria-label="Ilê Conecta" className={cn("dark:hidden shrink-0", className)}>
        {drawing("#0E3B2C", "#C99A2E")}
      </svg>
      {goldSvg(cn("hidden dark:block shrink-0", className))}
    </>
  );
}

/** Marca dourada solta, para fundos escuros (ex.: painel da tela de entrada). */
export function GoldMark({ size = 36, className }: { size?: number; className?: string }) {
  return <BareMark size={size} gold className={className} />;
}

/** Marca dentro de um círculo esmeralda com a folha dourada (igual ao ícone do app). Use `bare` para a marca solta. */
export function LogoMark({ size = 36, ring = false, bare = false, className }: { size?: number; ring?: boolean; bare?: boolean; className?: string }) {
  if (bare || ring) return <BareMark size={size} ring={ring} className={className} />;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-[#C99A2E]/45 shadow-card", className)}
      style={{ width: size, height: size, background: "linear-gradient(135deg,#14543F,#0A2E22)" }}
    >
      <BareMark size={Math.round(size * 0.64)} gold />
    </span>
  );
}

/** Marca + nome. Em telas estreitas pode mostrar só a marca (`compact`). */
export function Brand({ size = 36, subtitle = true, compact = false }: { size?: number; subtitle?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={cn("leading-tight", compact && "hidden sm:block")}>
        <span className="block font-display font-bold text-lg">Ilê Conecta</span>
        {subtitle && <span className="block text-[10px] tracking-widest text-muted-foreground uppercase">rede das casas</span>}
      </span>
    </span>
  );
}

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Emblema do Ilê Conecta: um arco (a porta da casa, o "ilê"), a pessoa que chega (o ponto) e três pontos ligados (a rede de casas).
 *  Neutro de propósito: não remete a nenhuma linha específica. Esmeralda no tema claro e dourado no escuro (troca sozinho com o tema).
 *  Até ~56 px usa a versão simplificada (arco grosso e ponto), que continua legível em tamanho pequeno. */
const ARCH = "M170 392V262a86 86 0 0 1 172 0v130";
function BareMark({ size = 36, ring = false, gold = false, className }: { size?: number; ring?: boolean; gold?: boolean; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const simple = size < 56;
  const drawing = (stroke: string, dot: string) =>
    simple ? (
      <>
        {ring && <circle cx="256" cy="256" r="222" fill="none" stroke={stroke} strokeWidth="16" />}
        <path d={ARCH} fill="none" stroke={stroke} strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="256" cy="312" r="40" fill={dot} />
      </>
    ) : (
      <>
        {ring && (
          <>
            <circle cx="256" cy="256" r="222" fill="none" stroke={stroke} strokeWidth="7" />
            <circle cx="256" cy="256" r="204" fill="none" stroke={stroke} strokeWidth="2.5" opacity={0.7} />
          </>
        )}
        <path d={ARCH} fill="none" stroke={stroke} strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M158 150Q256 96 354 150" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
        <g fill={stroke}>
          <circle cx="158" cy="150" r="13" />
          <circle cx="256" cy="121" r="17" />
          <circle cx="354" cy="150" r="13" />
        </g>
        <circle cx="256" cy="318" r="30" fill={dot} />
      </>
    );
  // Sem círculo, recorta junto ao arco (simples: arco e ponto; completo: inclui os três pontos).
  const viewBox = ring ? "0 0 512 512" : simple ? "122 150 268 268" : "96 96 320 320";
  const goldSvg = (cls: string) => (
    <svg width={size} height={size} viewBox={viewBox} role="img" aria-label="Ilê Conecta" className={cls}>
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DD9A" />
          <stop offset=".5" stopColor="#D9AE4A" />
          <stop offset="1" stopColor="#A97C24" />
        </linearGradient>
      </defs>
      {drawing(`url(#g${gid})`, `url(#g${gid})`)}
    </svg>
  );
  if (gold) return goldSvg(cn("shrink-0", className));
  return (
    <>
      <svg width={size} height={size} viewBox={viewBox} role="img" aria-label="Ilê Conecta" className={cn("dark:hidden shrink-0", className)}>
        {drawing("#0E3B2C", "#B98A2C")}
      </svg>
      {goldSvg(cn("hidden dark:block shrink-0", className))}
    </>
  );
}

/** Marca dourada solta, para fundos escuros (ex.: painel da tela de entrada). */
export function GoldMark({ size = 36, className }: { size?: number; className?: string }) {
  return <BareMark size={size} gold className={className} />;
}

/** Marca dentro de um círculo esmeralda com o emblema dourado (igual ao ícone do app). Use `bare` para a marca solta. */
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

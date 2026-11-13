import { useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/** Foto redonda da assistente; sem foto (ou se a imagem não carregar) mostra o ícone padrão. */
export default function AssistantAvatar({ url, size = 24, className }: { url?: string | null; size?: number; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = { width: size, height: size };
  if (url && failedUrl !== url) {
    return <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} style={box} className={cn("rounded-full object-cover shrink-0", className)} />;
  }
  return (
    <span style={box} className={cn("grid place-items-center rounded-full bg-primary/10 text-primary shrink-0", className)} aria-hidden="true">
      <Bot style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  );
}

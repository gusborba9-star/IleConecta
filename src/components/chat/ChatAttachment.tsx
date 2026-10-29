import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { formatSize, signedUrl } from "@/lib/chatFiles";

interface Props { bucket?: string; path: string; type: string; name: string; size?: number | null }

/** Mostra a foto (toque para abrir) ou o PDF (toque para baixar). O link é temporário. */
export default function ChatAttachment({ bucket = "chat-files", path, type, name, size }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void signedUrl(bucket, path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [bucket, path]);

  if (failed) return <div className="text-xs italic opacity-70">Arquivo indisponível</div>;
  if (!url) return <div className="h-24 w-40 rounded-lg bg-muted/50 animate-pulse" aria-label="Carregando arquivo" />;
  if (type === "application/pdf") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 no-underline">
        <FileText className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name}</span>
          {size ? <span className="block text-[10px] opacity-70">PDF · {formatSize(size)}</span> : null}
        </span>
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      <img src={url} alt={name} loading="lazy" className="max-h-60 max-w-full rounded-lg object-cover" />
    </a>
  );
}

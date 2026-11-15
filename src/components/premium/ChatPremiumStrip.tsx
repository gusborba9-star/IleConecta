import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, X } from "lucide-react";

const KEY = "ile:chat-premium-strip-hidden";
const read = () => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

/** Faixa de uma linha sobre fotos e vídeos no chat (Premium). Não cobre as mensagens e pode ser dispensada. */
export default function ChatPremiumStrip() {
  const [hidden, setHidden] = useState(read);
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    try { localStorage.setItem(KEY, "1"); } catch { /* sem armazenamento: some só nesta visita */ }
  };
  return (
    <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-1.5 text-xs" role="note">
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E3BF5A] px-2 py-0.5 font-bold text-[#2B1A10]"><Camera className="h-3 w-3" /> Premium</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">Fotos e vídeos no chat</span>
      <Link to="/planos" className="shrink-0 font-semibold text-primary hover:underline">Conhecer</Link>
      <button type="button" aria-label="Dispensar aviso" className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted" onClick={close}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

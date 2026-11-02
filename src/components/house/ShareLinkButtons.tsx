import { Download, Facebook, Instagram, Mail, MessageCircle, Send, Share2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/base";

interface Props {
  link: string;
  /** Texto que acompanha o link (a descrição do cartão ou uma frase padrão). */
  text: string;
  /** Imagem do cartão em PNG, para enviar junto quando o aparelho deixa. */
  getImage: () => Promise<Blob | null>;
}

const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

/** Compartilhamento direto do link de divulgação. WhatsApp, Facebook, Telegram e e-mail abrem na hora; Instagram, TikTok e YouTube recebem o cartão pela folha de compartilhar do celular. */
export default function ShareLinkButtons({ link, text, getImage }: Props) {
  const msg = `${text} ${link}`.trim();
  const u = encodeURIComponent(link);
  const m = encodeURIComponent(msg);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      return false;
    }
  };
  const saveImage = async () => {
    const blob = await getImage();
    if (!blob) return false;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cartao-divulgacao.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  };

  /** Folha de compartilhar do sistema: mostra os aplicativos instalados (Instagram, TikTok, YouTube e outros). */
  const toApps = async () => {
    const blob = await getImage();
    const file = blob ? new File([blob], "cartao-divulgacao.png", { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: msg });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text, url: link });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    // Computador: baixa o cartão e copia o link para colar no aplicativo.
    const saved = await saveImage();
    const copied = await copy();
    toast.success(saved && copied ? "Cartão baixado e link copiado. Agora é só postar no aplicativo." : "Cartão baixado. Copie o link para colar na publicação.");
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Abrir direto</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => open(`https://wa.me/?text=${m}`)}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
          <Button size="sm" variant="outline" onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${u}`)}><Facebook className="h-4 w-4" /> Facebook</Button>
          <Button size="sm" variant="outline" onClick={() => open(`https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}`)}><Send className="h-4 w-4" /> Telegram</Button>
          <Button size="sm" variant="outline" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent("Conheça a nossa casa")}&body=${m}`; }}><Mail className="h-4 w-4" /> E-mail</Button>
        </div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Instagram, TikTok, YouTube e outros</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void toApps()}><Share2 className="h-4 w-4" /> Enviar o cartão para o aplicativo</Button>
          <span className="inline-flex items-center gap-1 text-muted-foreground" aria-hidden><Instagram className="h-4 w-4" /><Youtube className="h-4 w-4" /></span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">No celular, abre a lista de aplicativos com o cartão pronto. No computador, baixa o cartão e copia o link.</p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => void saveImage()}><Download className="h-4 w-4" /> Só baixar a imagem</Button>
    </div>
  );
}

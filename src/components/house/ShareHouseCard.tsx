import { useEffect, useMemo, useState } from "react";
import { Copy, Download, QrCode, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchMyHouseSlug, publicHouseUrl } from "@/lib/publicHouse";
import { qrSvg } from "@/lib/qr";

/** Link público e QR code da casa: abrem sem login, para colocar na porta, em panfletos, no Instagram e no WhatsApp. */
export default function ShareHouseCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const uid = currentUser?.id;
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    let alive = true;
    void fetchMyHouseSlug(uid).then((s) => alive && setSlug(s));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid]);

  const link = slug ? publicHouseUrl(slug) : "";
  const svg = useMemo(() => (link ? qrSvg(link, { scale: 10 }) : ""), [link]);
  if (!isRemoteAuth || !slug) return null;

  const message = `Conheça a minha casa no Ilê Conecta: ${link}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie.");
    }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: currentUser?.name, text: "Conheça a minha casa no Ilê Conecta", url: link });
      else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    } catch {
      /* compartilhar cancelado */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return void toast.error("Não foi possível gerar a imagem.");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `qr-${slug}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, "image/png");
    };
    img.onerror = () => toast.error("Não foi possível gerar a imagem.");
    img.src = url;
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /><h2 className="font-display font-bold text-lg">Link e QR code da sua casa</h2></div>
      <p className="text-sm text-muted-foreground">Qualquer pessoa abre este endereço sem precisar de conta e vê a sua casa e os seus serviços. Coloque o QR code na porta, em panfletos ou no Instagram.</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-xl border border-border bg-white p-1 w-40 h-40 shrink-0 [&>svg]:w-full [&>svg]:h-full" role="img" aria-label="QR code do link da sua casa" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="flex-1 min-w-[200px] space-y-2">
          <div className="rounded-xl bg-muted px-3 py-2 text-sm break-all select-all">{link}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy()}><Copy className="h-4 w-4" /> Copiar link</Button>
            <Button size="sm" variant="outline" onClick={() => void share()}><Share2 className="h-4 w-4" /> Compartilhar</Button>
            <Button size="sm" variant="outline" onClick={download}><Download className="h-4 w-4" /> Baixar QR</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Button, Card, Textarea } from "@/components/base";
import { Image, Sparkles, Radio } from "lucide-react";
import { toast } from "sonner";
import { toastSaveError } from "@/lib/planGuard";
import PostStylePicker, { EMPTY_STYLE, type StyleDraft } from "@/components/feed/PostStylePicker";
import { useOwnerPlan } from "@/lib/housePlan";
import { toColumn, validateDraft } from "@/lib/postCardCore";
import { removeCardImage, uploadCardImage } from "@/lib/postImages";

export default function PostComposer() {
  const { currentUser, createPost, isRemoteAuth } = useApp();
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const isHouse = currentUser?.type === "commercial";
  const [style, setStyle] = useState<StyleDraft>(EMPTY_STYLE);
  const { caps } = useOwnerPlan(isHouse ? currentUser?.id : null);
  const allowed = caps?.styled_posts === true;

  if (!currentUser) return null;

  // Na conta real só casas publicam (regra do servidor); clientes interagem curtindo e comentando.
  if (isRemoteAuth && !isHouse) return null;

  const submit = async () => {
    const check = validateDraft({ text, mode: style.mode, hasImage: Boolean(style.image), ack: style.ack, allowed });
    if (!check.ok) return toast.error(check.error);
    setSending(true);
    const col = toColumn(style.mode);
    let cardPath: string | null = null;
    if (col && style.image) {
      if (isRemoteAuth) {
        cardPath = await uploadCardImage(currentUser.id, style.image.blob);
        if (!cardPath) { setSending(false); return toast.error("Não foi possível enviar a foto agora. Tente novamente."); }
      }
    }
    const saved = await createPost(
      {
        houseId: currentUser.id,
        content: text.trim(),
        kind: "geral",
        image: col ? undefined : image || undefined,
        card: col && style.image ? { style: col, image: style.image.previewUrl, scrimPct: style.image.scrimPct } : undefined,
      },
      cardPath ? { cardPath } : undefined
    );
    setSending(false);
    if (!saved) {
      if (cardPath) void removeCardImage(cardPath);
      return toastSaveError("Não foi possível publicar agora. Tente novamente.");
    }
    setText("");
    setImage("");
    setStyle(EMPTY_STYLE);
    toast.success(isRemoteAuth ? "Publicação enviada." : "Publicação adicionada ao feed local de demonstração.");
  };

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar src={currentUser.avatar} name={currentUser.name} size={44} ring={isHouse ? "gold" : "none"} />
        <div className="flex-1 space-y-3">
          <Textarea
            aria-label="Texto da publicação"
            placeholder={
              isHouse
                ? "Compartilhe um trabalho, ritual, jogo, consulta ou uma mensagem para a sua comunidade..."
                : "O que você está sentindo? Compartilhe com a comunidade..."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          {isHouse && <PostStylePicker value={style} onChange={setStyle} text={text} allowed={allowed || !isRemoteAuth} houseName={currentUser.name} />}
          {image && !style.image && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={image} alt="" className="w-full max-h-72 object-cover" />
              <button onClick={() => setImage("")} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white">✕</button>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
              {!isRemoteAuth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setImage(
                    "https://images.unsplash.com/photo-" +
                      ["1503756234508-e32369269deb", "1441716844725-09cedc13a4e7", "1500375592092-40eb2168fd21", "1470252649378-9c29740c9fa8"][
                        Math.floor(Math.random() * 4)
                      ] +
                      "?w=1200&h=800&fit=crop"
                  )
                }
              >
                <Image className="h-4 w-4" /> Foto
              </Button>
              )}
              {isHouse && (
                <>
                  <Button variant="ghost" size="sm" disabled title="Publicação de rituais ainda não está disponível no protótipo">
                    <Sparkles className="h-4 w-4 text-gold" /> Ritual indisponível
                  </Button>
                  <Button variant="ghost" size="sm" disabled title="Transmissões ao vivo ainda não estão disponíveis no protótipo">
                    <Radio className="h-4 w-4 text-primary" /> Ao vivo indisponível
                  </Button>
                </>
              )}
            </div>
            <Button onClick={submit} disabled={sending}>{sending ? "Publicando…" : "Publicar"}</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

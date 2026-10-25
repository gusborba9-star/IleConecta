import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Button, Card, Textarea } from "@/components/base";
import { Image, Sparkles, Radio } from "lucide-react";
import { toast } from "sonner";

export default function PostComposer() {
  const { currentUser, createPost } = useApp();
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const isHouse = currentUser?.type === "commercial";

  if (!currentUser) return null;

  const submit = () => {
    if (!text.trim()) return toast.error("Escreva algo antes de publicar");
    createPost({
      houseId: currentUser.id,
      content: text.trim(),
      kind: "geral",
      image: image || undefined,
    });
    setText("");
    setImage("");
    toast.success(isHouse ? "Publicação divulgada nas suas redes" : "Momento publicado no seu feed");
  };

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar src={currentUser.avatar} name={currentUser.name} size={44} ring={isHouse ? "gold" : "none"} />
        <div className="flex-1 space-y-3">
          <Textarea
            placeholder={
              isHouse
                ? "Compartilhe um trabalho, ritual, jogo de búzios ou uma mensagem para seus filhos de santo..."
                : "O que você está sentindo? Compartilhe com a comunidade..."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          {image && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={image} alt="" className="w-full max-h-72 object-cover" />
              <button onClick={() => setImage("")} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white">✕</button>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
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
              {isHouse && (
                <>
                  <Button variant="ghost" size="sm">
                    <Sparkles className="h-4 w-4 text-gold" /> Ritual
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Radio className="h-4 w-4 text-primary" /> Ao vivo
                  </Button>
                </>
              )}
            </div>
            <Button onClick={submit}>Publicar</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

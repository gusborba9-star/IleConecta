import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Button, Card, Modal, Textarea } from "@/components/base";
import { CalendarDays, Image, ImagePlus, Megaphone, Sparkles, Radio } from "lucide-react";
import { toast } from "sonner";
import { toastSaveError } from "@/lib/planGuard";
import PostStylePicker from "@/components/feed/PostStylePicker";
import { EMPTY_STYLE, type StyleDraft } from "@/components/feed/postStyleDraft";
import { useOwnerPlan } from "@/lib/housePlan";
import { toColumn, validateDraft } from "@/lib/postCardCore";
import { fitToMode, scrimPctFor } from "@/lib/postLettersCore";
import { fetchHouseRituals, type RealRitual } from "@/lib/rituals";
import { CATEGORIES, type PostCategory } from "@/lib/postCategoryCore.js";
import { removeCardImage, uploadCardImage } from "@/lib/postImages";

export default function PostComposer() {
  const { currentUser, createPost, isRemoteAuth } = useApp();
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [category, setCategory] = useState<PostCategory>("geral");
  const [eventId, setEventId] = useState("");
  const [myRituals, setMyRituals] = useState<RealRitual[]>([]);
  const isHouse = currentUser?.type === "commercial";
  const [style, setStyle] = useState<StyleDraft>(EMPTY_STYLE);
  // A barra fica fechada (como "No que você está pensando?"); o editor completo abre numa janela.
  const [open, setOpen] = useState(false);
  const { caps } = useOwnerPlan(isHouse ? currentUser?.id : null);
  const allowed = caps?.styled_posts === true;
  // Atalho "Publicar" do Início da casa (`/comunidade?novo=publicacao`): leva o foco para o campo de texto.
  const [params] = useSearchParams();
  const novo = params.get("novo");
  const wantsOpen = novo === "publicacao" || novo === "gira" || novo === "aviso" || novo === "foto";
  useEffect(() => {
    if (!wantsOpen || !currentUser) return;
    if (novo === "gira") setCategory("evento");
    else if (novo === "aviso") setCategory("aviso");
    setOpen(true);
  }, [wantsOpen, novo, currentUser]);

  // Giras e eventos: a casa pode anexar um dos seus rituais abertos (cartão com "Reservar vaga" no feed).
  const wantsRitual = isHouse && isRemoteAuth && category === "evento";
  const uid = currentUser?.id;
  useEffect(() => {
    if (!wantsRitual || !uid) return;
    let alive = true;
    void fetchHouseRituals(uid).then((l) => alive && setMyRituals(l.filter((r) => r.status === "publicado" && Date.parse(r.startsAt) > Date.now())));
    return () => { alive = false; };
  }, [wantsRitual, uid]);

  // Atalhos da casa: já abrem a janela no tipo certo (Gira, Aviso) ou no cartão com foto.
  const openAs = (kind: "evento" | "aviso" | "foto") => {
    if (kind === "foto") { if (allowed || !isRemoteAuth) setStyle((s) => (s.mode === "normal" ? { ...s, mode: "parcial", letters: fitToMode(s.letters, "parcial") } : s)); }
    else setCategory(kind);
    setOpen(true);
  };

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
        category,
        eventId: category === "evento" && eventId ? eventId : undefined,
        image: col ? undefined : image || undefined,
        card: col && style.image ? { style: col, image: style.image.previewUrl, scrimPct: col === "total" ? scrimPctFor(style.image.brightness, style.letters.color) : style.image.scrimPct, letters: fitToMode(style.letters, col) } : undefined,
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
    setCategory("geral");
    setEventId("");
    setStyle(EMPTY_STYLE);
    setOpen(false);
    toast.success(isRemoteAuth ? "Publicação enviada." : "Publicação adicionada ao feed local de demonstração.");
  };

  const prompt = isHouse ? "Diga algo à comunidade…" : "No que você está pensando?";
  const draft = text.trim();

  return (
    <>
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <Avatar src={currentUser.avatar} name={currentUser.name} size={42} ring={isHouse ? "gold" : "none"} />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 min-w-0 flex-1 truncate rounded-full border border-border bg-muted/40 px-4 text-left text-sm text-muted-foreground transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {draft ? `Rascunho: ${draft}` : prompt}
          </button>
          {!isHouse && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Escolher foto para a publicação"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ImagePlus className="h-6 w-6" aria-hidden />
            </button>
          )}
        </div>
        {isHouse && (
          <div role="group" aria-label="Atalhos da publicação" className="mt-2 grid grid-cols-3 gap-2">
            {([
              { id: "evento", label: "Gira", Icon: CalendarDays },
              { id: "aviso", label: "Aviso", Icon: Megaphone },
              { id: "foto", label: "Foto", Icon: ImagePlus },
            ] as const).map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => openAs(id)} aria-label={label === "Gira" ? "Nova gira" : label === "Aviso" ? "Novo aviso" : "Foto na publicação"}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <Icon className="h-4 w-4 text-primary" aria-hidden /> {label}
              </button>
            ))}
          </div>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova publicação" maxWidth="max-w-xl">
        <div className="space-y-3">
          {isHouse && (
            <div role="group" aria-label="Tipo da publicação" className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const on = category === c.id;
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setCategory(on ? "geral" : c.id)}
                    className={`min-h-9 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
          {wantsRitual && myRituals.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Anexar um ritual (opcional)</span>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-11 w-full rounded-[14px] border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Sem ritual</option>
                {myRituals.map((r) => <option key={r.id} value={r.id}>{r.title} · {new Date(r.startsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</option>)}
              </select>
            </label>
          )}
          <Textarea
            id="texto-da-publicacao"
            aria-label="Texto da publicação"
            placeholder={isHouse ? "Compartilhe um trabalho, ritual, jogo, consulta ou uma mensagem para a sua comunidade..." : "O que você está sentindo? Compartilhe com a comunidade..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
          {isHouse && <PostStylePicker value={style} onChange={setStyle} text={text} allowed={allowed || !isRemoteAuth} houseName={currentUser.name} />}
          {image && !style.image && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={image} alt="" className="w-full max-h-72 object-cover" />
              <button type="button" aria-label="Remover a foto" onClick={() => setImage("")} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white">✕</button>
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
                        ["1503756234508-e32369269deb", "1441716844725-09cedc13a4e7", "1500375592092-40eb2168fd21", "1470252649378-9c29740c9fa8"][Math.floor(Math.random() * 4)] +
                        "?w=1200&h=800&fit=crop"
                    )
                  }
                >
                  <Image className="h-4 w-4" /> Foto
                </Button>
              )}
              {isHouse && !isRemoteAuth && (
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
      </Modal>
    </>
  );
}

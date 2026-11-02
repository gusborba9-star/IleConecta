import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Download, ImagePlus, Megaphone, MessageSquareText, Plus, Trash2, TrendingUp } from "lucide-react";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import PremiumShowcase from "@/components/premium/PremiumShowcase";
import { useApp } from "@/contexts/AppContext";
import {
  LIMITS, SOURCES, addQuickReply, campaignUrl, createCampaign, fetchCampaignDays, fetchCampaigns, fetchQuickReplies, fetchTopics, fetchTopServices, houseIdOf, removeCampaign, removeQuickReply,
  type Campaign, type Count, type DayCount, type QuickReply, type SourceId,
} from "@/lib/campaigns";
import { useOwnerPlan } from "@/lib/housePlan";
import { fetchMyHouseSlug } from "@/lib/publicHouse";
import { CARD_STYLES, drawShareCard, type CardStyleId } from "@/lib/shareCard";

const srcLabel = (s: SourceId) => SOURCES.find((x) => x.id === s)?.label ?? "Outro lugar";

/** Divulgação da casa: um link por rede social, quantas pessoas chegaram por ele, cartão pronto para postar e respostas rápidas do chat. */
export default function Divulgacao() {
  const { currentUser, isRemoteAuth } = useApp();
  const confirm = useConfirm();
  const uid = currentUser?.id;
  const { plan, premium, loading } = useOwnerPlan(uid);
  const [slug, setSlug] = useState<string | null>(null);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [source, setSource] = useState<SourceId>("instagram");
  const [label, setLabel] = useState("");
  const [rTitle, setRTitle] = useState("");
  const [rBody, setRBody] = useState("");
  const [cardId, setCardId] = useState<string>("");
  const [style, setStyle] = useState<CardStyleId>("folha");
  const [days, setDays] = useState<{ id: string; rows: DayCount[] } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [cardText, setCardText] = useState("");
  const [topics, setTopics] = useState<Count[]>([]);
  const [topServices, setTopServices] = useState<Count[]>([]);
  const formRef = useRef<HTMLDivElement>(null);

  const lim = LIMITS[plan ?? "base"];
  const reload = useCallback(async () => {
    const [c, r] = await Promise.all([fetchCampaigns(), fetchQuickReplies()]);
    setCamps(c);
    setReplies(r);
  }, []);

  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    void fetchMyHouseSlug(uid).then(setSlug);
    void houseIdOf(uid).then(setHouseId);
    void reload();
    void fetchTopics().then(setTopics);
    void fetchTopServices().then(setTopServices);
  }, [isRemoteAuth, uid, reload]);

  const active = useMemo(() => camps.find((c) => c.id === cardId) ?? camps[0], [camps, cardId]);
  const link = slug && active ? campaignUrl(slug, active.code) : "";
  const allowedStyles = CARD_STYLES.slice(0, lim.cards);

  // A descrição do cartão fica guardada neste aparelho, por link.
  useEffect(() => {
    if (!active) return;
    try {
      setCardText(localStorage.getItem(`cardtxt:${active.code}`) ?? "");
    } catch {
      setCardText("");
    }
  }, [active]);
  const onCardText = (v: string) => {
    setCardText(v);
    try {
      if (active) localStorage.setItem(`cardtxt:${active.code}`, v);
    } catch {
      /* sem armazenamento: vale só nesta tela */
    }
  };
  const pickPhoto = (f?: File) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return void toast.error("Escolha uma foto JPG, PNG ou WebP.");
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { setPhoto(img); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error("Não foi possível abrir esta imagem."); };
    img.src = url;
  };

  useEffect(() => {
    if (canvas.current && link && currentUser) drawShareCard(canvas.current, { name: currentUser.name, text: cardText, link, style: allowedStyles.some((s) => s.id === style) ? style : "folha", photo });
  }, [link, style, currentUser, allowedStyles, cardText, photo]);

  if (!currentUser || currentUser.type !== "commercial" || !isRemoteAuth) {
    return <Card className="p-6"><h1 className="font-display font-bold text-2xl">Divulgação</h1><p className="text-sm text-muted-foreground mt-1">Esta área é da conta de uma casa.</p></Card>;
  }
  if (loading) return <div className="h-40" aria-busy />;
  if (plan === "base") return <div className="space-y-4 pb-16 lg:pb-4"><PremiumShowcase kind="outreach" /></div>;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie.");
    }
  };
  const create = async () => {
    if (!houseId || label.trim().length < 2) return void toast.error("Dê um nome ao link, como “Instagram da casa”.");
    const err = await createCampaign(houseId, source, label);
    if (err) return void toast.error(err);
    setLabel("");
    toast.success("Link criado.");
    await reload();
  };
  const drop = async (c: Campaign) => {
    if (!(await confirm({ title: "Apagar este link?", message: "Quem já o tem continua chegando à página da casa, mas ele deixa de ser contado.", confirmLabel: "Apagar", danger: true }))) return;
    if (!(await removeCampaign(c.id))) toast.error("Não foi possível apagar.");
    await reload();
  };
  const showDays = async (c: Campaign) => {
    if (days?.id === c.id) return setDays(null);
    const rows = await fetchCampaignDays(c.id, 30);
    if (!rows) return void toast.error("A contagem dia a dia é do plano Premium.");
    setDays({ id: c.id, rows });
  };
  const download = () => {
    canvas.current?.toBlob((b) => {
      if (!b) return void toast.error("Não foi possível gerar a imagem.");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `cartao-${active?.code ?? "casa"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };
  const addReply = async () => {
    if (!houseId) return;
    const err = await addQuickReply(houseId, rTitle, rBody);
    if (err) return void toast.error(err);
    setRTitle("");
    setRBody("");
    await reload();
  };

  const maxDay = Math.max(1, ...(days?.rows.map((d) => d.visits) ?? [1]));
  const linksFull = camps.length >= lim.links;
  const repliesFull = replies.length >= lim.replies;

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Divulgação</div>
        <h1 className="font-display font-bold text-2xl flex items-center gap-2 mt-1"><Megaphone className="h-6 w-6 text-primary" /> Saiba de onde vêm as pessoas da sua casa</h1>
        <p className="text-sm text-muted-foreground mt-1">Crie um link para cada lugar em que a casa aparece. Quem chega por ele vai direto à página da casa, e você vê quantos vieram, sem saber quem são.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display font-bold text-lg">Seus links</h2>
          <Badge tone="gold">{camps.length} de {lim.links}</Badge>
        </div>
        {camps.length === 0 && <p className="text-sm text-muted-foreground">Você ainda não criou nenhum link. Comece pelo lugar em que a casa mais aparece.</p>}
        <ul className="space-y-2">
          {camps.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.label} <Badge tone="muted" className="ml-1">{srcLabel(c.source)}</Badge></div>
                  <div className="text-xs text-muted-foreground break-all mt-0.5 select-all">{slug ? campaignUrl(slug, c.code) : ""}</div>
                </div>
                <div className="flex gap-4 text-center">
                  <div><div className="font-display font-bold text-xl">{c.visits}</div><div className="text-[11px] text-muted-foreground">visitas</div></div>
                  <div><div className="font-display font-bold text-xl">{c.contacts}</div><div className="text-[11px] text-muted-foreground">quiseram falar</div></div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => slug && void copy(campaignUrl(slug, c.code))}><Copy className="h-4 w-4" /> Copiar link</Button>
                <Button size="sm" variant="outline" onClick={() => setCardId(c.id)}>Cartão deste link</Button>
                <Button size="sm" variant="ghost" onClick={() => void showDays(c)}>{premium ? "Ver dia a dia" : "Dia a dia · Premium"}</Button>
                <Button size="sm" variant="ghost" aria-label={`Apagar ${c.label}`} onClick={() => void drop(c)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {days?.id === c.id && (
                <div className="pillow rounded-xl bg-card p-3" role="img" aria-label="Visitas por dia nos últimos 30 dias">
                  {days.rows.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não houve visitas neste período.</p> : (
                    <div className="flex items-end gap-1 h-24">
                      {days.rows.map((d) => <div key={d.day} title={`${d.day.slice(8)}/${d.day.slice(5, 7)}: ${d.visits}`} className="flex-1 rounded-t bg-gradient-to-t from-[#14543F] to-[#1F7A5C]" style={{ height: `${Math.max(6, (d.visits / maxDay) * 100)}%` }} />)}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {linksFull ? (
          <p className="text-sm text-muted-foreground">Você usou os {lim.links} links do seu plano.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] items-end">
            <div>
              <Label htmlFor="camp-src">Onde vai divulgar</Label>
              <select id="camp-src" value={source} onChange={(e) => setSource(e.target.value as SourceId)} className="h-11 w-full rounded-[14px] border border-input bg-card px-3 text-sm">
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="camp-label">Nome do link</Label>
              <Input id="camp-label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex.: Instagram da casa" />
            </div>
            <Button onClick={() => void create()}><Plus className="h-4 w-4" /> Criar link</Button>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Cartão para postar</h2>
        {!active ? <p className="text-sm text-muted-foreground">Crie um link e o cartão com o QR code aparece aqui, pronto para postar.</p> : (
          <div className="grid gap-4 md:grid-cols-[240px_1fr] items-start">
            <canvas ref={canvas} className="w-full max-w-[240px] rounded-2xl ring-1 ring-gold/50 shadow-card" aria-label="Prévia do cartão de divulgação" />
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Cartão do link <strong>{active.label}</strong>, no tamanho de publicação. Quem apontar a câmera chega à sua casa.</p>
              <div>
                <Label htmlFor="card-text">Descrição no cartão</Label>
                <Textarea id="card-text" rows={3} maxLength={140} value={cardText} onChange={(e) => onCardText(e.target.value)} placeholder="ex.: Encontros abertos aos sábados, atendimento com hora marcada" />
                <div className="text-xs text-muted-foreground mt-1">{cardText.length} de 140</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickPhoto(f); }} />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> {photo ? "Trocar imagem" : "Escolher imagem da galeria"}</Button>
                {photo && <Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>Tirar imagem</Button>}
                <span className="text-xs text-muted-foreground">A imagem fica só no seu aparelho.</span>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Estilo do cartão">
                {CARD_STYLES.map((s) => {
                  const ok = allowedStyles.some((a) => a.id === s.id);
                  return <button key={s.id} type="button" role="radio" aria-checked={style === s.id} disabled={!ok} onClick={() => setStyle(s.id)}
                    className={`h-10 px-4 rounded-[14px] text-sm font-semibold border ${style === s.id ? "bg-forest text-white border-forest" : "bg-card border-input"} ${ok ? "" : "opacity-50"}`}>{s.label}{ok ? "" : " · Premium"}</button>;
                })}
              </div>
              <Button onClick={download}><Download className="h-4 w-4" /> Baixar imagem</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> O que mais procuram na sua casa</h2>
        <p className="text-sm text-muted-foreground">Os assuntos que mais aparecem nas mensagens dos últimos 30 dias e os serviços mais pedidos. Use para criar as respostas que você mais precisa.</p>
        {topics.length === 0 ? <p className="text-sm text-muted-foreground">Quando as pessoas começarem a conversar com a casa, os assuntos mais procurados aparecem aqui.</p> : (
          <ul className="space-y-2">
            {(premium ? topics : topics.slice(0, 3)).map((t) => (
              <li key={t.label} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm"><span className="font-semibold">{t.label}</span><span className="text-muted-foreground">{t.total} {t.total === 1 ? "mensagem" : "mensagens"}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#14543F] to-[#1F7A5C]" style={{ width: `${Math.max(6, (t.total / (topics[0]?.total || 1)) * 100)}%` }} /></div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setRTitle(t.label.slice(0, 40)); formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Criar resposta</Button>
              </li>
            ))}
          </ul>
        )}
        {premium && topServices.length > 0 && (
          <div className="pillow rounded-2xl bg-muted/30 p-3">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-gold-ink">Serviços mais pedidos · 90 dias</div>
            <ul className="mt-2 space-y-1 text-sm">{topServices.map((t) => <li key={t.label} className="flex justify-between gap-2"><span className="truncate">{t.label}</span><strong>{t.total}</strong></li>)}</ul>
          </div>
        )}
        {!premium && topics.length > 3 && <p className="text-xs text-muted-foreground">No Premium você vê todos os assuntos e os serviços mais pedidos.</p>}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display font-bold text-lg flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" /> Respostas rápidas do chat</h2>
          <Badge tone="gold">{replies.length} de {lim.replies}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Textos prontos para as perguntas que mais chegam, como endereço, horários e o que levar. No chat, um toque e a resposta entra na mensagem.</p>
        <ul className="space-y-2">
          {replies.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
              <div className="min-w-0 flex-1"><div className="font-semibold text-sm">{r.title}</div><p className="text-sm text-muted-foreground whitespace-pre-line break-words">{r.body}</p></div>
              <Button size="sm" variant="ghost" aria-label={`Apagar ${r.title}`} onClick={async () => { if (await removeQuickReply(r.id)) await reload(); else toast.error("Não foi possível apagar."); }}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
        {repliesFull ? <p className="text-sm text-muted-foreground">Você usou as {lim.replies} respostas do seu plano.</p> : (
          <div ref={formRef} className="space-y-2">
            <div><Label htmlFor="qr-t">Título</Label><Input id="qr-t" maxLength={40} value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="ex.: Endereço e horários" /></div>
            <div><Label htmlFor="qr-b">Texto da resposta</Label><Textarea id="qr-b" rows={3} maxLength={600} value={rBody} onChange={(e) => setRBody(e.target.value)} placeholder="O que você diria a quem pergunta" /></div>
            <Button disabled={rTitle.trim().length < 2 || rBody.trim().length < 2} onClick={() => void addReply()}><Plus className="h-4 w-4" /> Salvar resposta</Button>
          </div>
        )}
      </Card>

      {!premium && (
        <PremiumShowcase kind="growth" />
      )}
      <p className="text-xs text-muted-foreground text-center">Os números não identificam ninguém. <Link to="/planos" className="text-primary font-semibold">Ver planos</Link></p>
    </div>
  );
}

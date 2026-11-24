import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchVideoConfig, saveVideoConfig, setupDailyWebhook } from "@/lib/video";
import { PROVIDER_LABEL, VIDEO_PROVIDERS, VIDEO_STATES, VIDEO_STATE_LABEL, readVideoConfig, type VideoConfig } from "@/lib/videoCore";

const selectCls = "h-11 w-full rounded-[14px] border border-input bg-card px-3 text-sm";

/** Reuniões por vídeo: liga, desliga ou libera só para casas de teste, escolhe o serviço das próximas reuniões e cadastra o aviso do Daily. */
export default function VideoCard() {
  const { currentUser } = useApp();
  const [cfg, setCfg] = useState<VideoConfig | null>(null);
  const [betaText, setBetaText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetchVideoConfig().then((c) => { setCfg(c); setBetaText(c.beta_houses.join("\n")); }); }, []);
  if (!cfg) return null;
  const save = async () => {
    const ids = betaText.split(/[\s,;]+/).filter(Boolean);
    const next = readVideoConfig({ ...cfg, beta_houses: ids });
    if (ids.length !== next.beta_houses.length) return void toast.error("Há um código de casa inválido na lista.");
    setBusy(true);
    const ok = await saveVideoConfig(next);
    setBusy(false);
    if (!ok) return void toast.error("Não consegui salvar.");
    setCfg(next);
    toast.success("Vídeo atualizado.");
  };
  const addMine = () => {
    if (!currentUser?.id) return;
    if (!betaText.includes(currentUser.id)) setBetaText((t) => (t.trim() ? `${t.trim()}\n${currentUser.id}` : currentUser.id));
  };
  const webhook = async () => {
    setBusy(true);
    const r = await setupDailyWebhook();
    setBusy(false);
    if (r.ok) toast.success("Aviso do Daily cadastrado."); else toast.error(r.error ?? "Falhou.");
  };
  return (
    <Card className="space-y-3 p-5" data-testid="video-admin">
      <h2 className="font-display text-lg font-bold">Reuniões por vídeo</h2>
      <p className="text-xs text-muted-foreground">O vídeo só funciona para casas cujo plano tenha minutos (matriz de planos). Trocar o serviço vale só para as reuniões marcadas depois; as já marcadas seguem no serviço em que foram criadas.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="vc-state" className="mb-1 block text-xs text-muted-foreground">Estado</label>
          <select id="vc-state" className={selectCls} value={cfg.state} onChange={(e) => setCfg({ ...cfg, state: e.target.value as VideoConfig["state"] })}>
            {VIDEO_STATES.map((s) => <option key={s} value={s}>{VIDEO_STATE_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="vc-prov" className="mb-1 block text-xs text-muted-foreground">Serviço das novas reuniões</label>
          <select id="vc-prov" className={selectCls} value={cfg.provider} onChange={(e) => setCfg({ ...cfg, provider: e.target.value as VideoConfig["provider"] })}>
            {VIDEO_PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="vc-beta" className="mb-1 block text-xs text-muted-foreground">Casas de teste (um código de conta por linha; vale no estado "Só casas de teste")</label>
        <textarea id="vc-beta" value={betaText} onChange={(e) => setBetaText(e.target.value)} rows={3} className="w-full rounded-[14px] border border-input bg-card p-3 font-mono text-xs" />
        <Button variant="outline" size="sm" className="mt-2" onClick={addMine}>Incluir a minha conta</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
        <Button variant="outline" onClick={() => void webhook()} disabled={busy}>Cadastrar aviso do Daily</Button>
      </div>
      <p className="text-xs text-muted-foreground">"Cadastrar aviso do Daily" registra, uma única vez, o endereço que recebe entradas e saídas para contar os minutos.</p>
    </Card>
  );
}

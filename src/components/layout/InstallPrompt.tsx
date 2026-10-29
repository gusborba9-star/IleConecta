import { useEffect, useState } from "react";
import { Download, Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/base";
import { enablePush, getPushState } from "@/lib/push";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KEY_INSTALL = "ic_install_dismissed";
const KEY_PUSH = "ic_push_invite_dismissed";
const DAY = 24 * 3600 * 1000;

const recently = (key: string, days: number) => {
  try {
    const t = Number(localStorage.getItem(key));
    return Boolean(t) && Date.now() - t < days * DAY;
  } catch {
    return false;
  }
};
const remember = (key: string) => {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* sem armazenamento: o convite volta na próxima visita */
  }
};

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Convida a instalar o app na tela inicial e, já instalado, a ligar os avisos no celular. */
export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone());
  const [pushOff, setPushOff] = useState(false);
  const [hideInstall, setHideInstall] = useState(() => recently(KEY_INSTALL, 14));
  const [hidePush, setHidePush] = useState(() => recently(KEY_PUSH, 14));

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setStandalone(true);
      setHidePush(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => alive && setPushOff(s === "off"));
    return () => {
      alive = false;
    };
  }, [standalone]);

  if (standalone) {
    if (!pushOff || hidePush) return null;
    return (
      <Banner
        icon={<Bell className="h-4 w-4" />}
        text="Ative os avisos do Ilê Conecta neste aparelho para saber na hora de pedidos, vagas e mensagens."
        action="Ativar avisos"
        onAction={async () => {
          const error = await enablePush();
          if (error) return void toast.error(error);
          toast.success("Avisos ativados neste aparelho.");
          setPushOff(false);
        }}
        onClose={() => {
          remember(KEY_PUSH);
          setHidePush(true);
        }}
      />
    );
  }

  if (hideInstall) return null;
  if (installEvent) {
    return (
      <Banner
        icon={<Download className="h-4 w-4" />}
        text="Instale o Ilê Conecta no seu celular para abrir como um aplicativo."
        action="Instalar"
        onAction={async () => {
          await installEvent.prompt();
          const choice = await installEvent.userChoice;
          setInstallEvent(null);
          if (choice.outcome === "dismissed") {
            remember(KEY_INSTALL);
            setHideInstall(true);
          }
        }}
        onClose={() => {
          remember(KEY_INSTALL);
          setHideInstall(true);
        }}
      />
    );
  }
  if (isIos()) {
    return (
      <Banner
        icon={<Download className="h-4 w-4" />}
        text="Para instalar no iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Assim você também recebe avisos."
        onClose={() => {
          remember(KEY_INSTALL);
          setHideInstall(true);
        }}
      />
    );
  }
  return null;
}

function Banner({ icon, text, action, onAction, onClose }: { icon: React.ReactNode; text: string; action?: string; onAction?: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div role="region" aria-label="Convite" className="rounded-2xl border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-3 text-sm shadow-sm">
      <span className="text-primary">{icon}</span>
      <span className="flex-1 min-w-[200px]">{text}</span>
      {action && onAction && <Button size="sm" onClick={() => void onAction()}>{action}</Button>}
      <button aria-label="Dispensar convite" className="p-1 text-muted-foreground hover:text-foreground" onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
  );
}

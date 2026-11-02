// Som de aviso com o app aberto. Por aparelho: a pessoa liga ou desliga no sino e fica guardado neste navegador.
const KEY = "ile.chime.on";

export function chimeEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setChimeEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* sem armazenamento: o som fica desligado */
  }
}

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Dois toques suaves (sol e dó agudo). Os navegadores só liberam o som depois de um toque da pessoa no app. */
export async function playChime(): Promise<void> {
  const c = context();
  if (!c) return;
  try {
    if (c.state === "suspended") await c.resume();
    const t0 = c.currentTime;
    [[784, 0], [1047, 0.16]].forEach(([freq, delay]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.5);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.55);
    });
  } catch {
    /* som bloqueado pelo navegador: o aviso visual continua */
  }
}

/** Libera o áudio no primeiro toque na tela (exigência dos navegadores). */
export function unlockChimeOnFirstTouch(): () => void {
  const unlock = () => {
    const c = context();
    if (c && c.state === "suspended") void c.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  return () => window.removeEventListener("pointerdown", unlock);
}

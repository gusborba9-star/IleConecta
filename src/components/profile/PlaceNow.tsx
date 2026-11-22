import { useState } from "react";
import { LocateFixed, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { clearPlaceNow, detectPlace, setPlaceNow, usePlace } from "@/lib/placeNow";

const same = (a: string, b: string) => a.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() === b.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** "Estou em outra cidade": a pessoa toca, o navegador pede autorização e mostramos o que há onde ela está. Só para clientes; nunca bloqueia nada. */
export default function PlaceNow() {
  const { currentUser } = useApp();
  const place = usePlace();
  const [busy, setBusy] = useState(false);
  if (!currentUser || currentUser.type === "commercial") return null;

  const use = async () => {
    setBusy(true);
    const r = await detectPlace();
    setBusy(false);
    if (r.ok === false) {
      toast.error(r.reason === "negado" ? "Sem autorização de localização. Você segue vendo as casas da sua cidade." : r.reason === "fora" ? "Não encontramos uma cidade brasileira na sua posição." : "Não foi possível obter sua localização agora.");
      return;
    }
    if (place.home.city && same(r.city, place.home.city)) { clearPlaceNow(); toast.success(`Você está em ${r.city}, na sua cidade.`); return; }
    setPlaceNow(r.city, r.state);
    toast.success(`Mostrando o que há em ${r.city}, ${r.state}.`);
  };

  if (place.temporary) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm" role="status">
        <span className="inline-flex items-center gap-1.5 font-medium"><LocateFixed className="h-4 w-4 text-primary" aria-hidden />Você está em {place.city}, {place.state}</span>
        <button type="button" onClick={clearPlaceNow} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Undo2 className="h-3.5 w-3.5" aria-hidden />{place.home.city ? `Voltar para ${place.home.city}` : "Desfazer"}
        </button>
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={use} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
        <LocateFixed className="h-4 w-4 text-primary" aria-hidden />{busy ? "Localizando…" : "Usar minha localização atual"}
      </button>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">Viajando? Seu aparelho pede sua autorização e usamos a posição só aqui, sem guardar coordenadas.</p>
    </div>
  );
}

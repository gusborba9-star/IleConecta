import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { routeTitle, withBrand } from "@/lib/routeTitleCore.js";

/** Atualiza o título da aba a cada tela e avisa o leitor de tela quando a pessoa troca de página (a primeira carga já é lida pelo navegador). */
export default function RouteTitle() {
  const { pathname } = useLocation();
  const [aviso, setAviso] = useState("");
  const anterior = useRef<string | null>(null);
  useEffect(() => {
    const t = routeTitle(pathname);
    if (t === null) return;
    document.title = withBrand(t);
    const mudou = anterior.current !== null && anterior.current !== pathname;
    anterior.current = pathname;
    if (mudou) setAviso(`Página: ${t}`);
  }, [pathname]);
  return <div role="status" aria-live="polite" className="sr-only">{aviso}</div>;
}

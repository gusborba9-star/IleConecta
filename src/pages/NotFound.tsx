import { useNavigate } from "react-router-dom";
import { Button } from "@/components/base";
import { LogoMark } from "@/components/brand/Logo";

export default function NotFound() {
  const nav = useNavigate();
  return (
    <main id="conteudo" tabIndex={-1} className="min-h-screen outline-none grid place-items-center p-6 text-center">
      <div className="flex flex-col items-center">
        <LogoMark size={64} />
        <h1 className="font-display font-bold text-6xl text-primary mt-4">404</h1>
        <p className="text-muted-foreground mt-2">Página não encontrada</p>
        <Button className="mt-4" onClick={() => nav("/")}>Voltar ao feed</Button>
      </div>
    </main>
  );
}

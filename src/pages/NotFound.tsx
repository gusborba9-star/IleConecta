import { Link } from "react-router-dom";
import { Button } from "@/components/base";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <div className="font-display font-bold text-6xl text-primary">404</div>
        <p className="text-muted-foreground mt-2">Página não encontrada</p>
        <Link to="/"><Button className="mt-4">Voltar ao feed</Button></Link>
      </div>
    </div>
  );
}

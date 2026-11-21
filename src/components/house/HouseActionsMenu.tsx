import { useNavigate } from "react-router-dom";
import { CalendarDays, CreditCard, Link2, MoreHorizontal, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ITEM = "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none focus:bg-muted data-[highlighted]:bg-muted";

/** Menu "⋯" do perfil da casa (como o do Facebook): o que sobra de ações sem poluir a tela. */
export default function HouseActionsMenu({ houseId, houseName, isOwn, remote }: { houseId: string; houseName: string; isOwn: boolean; remote: boolean }) {
  const nav = useNavigate();
  const share = async () => {
    const url = `${window.location.origin}/casa/${houseId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: houseName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link da página copiado.");
    } catch {
      /* compartilhamento cancelado */
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Mais opções da página"
        className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-black/35 text-white shadow-card backdrop-blur transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="z-50 w-60 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-altar">
        {isOwn && (
          <>
            <DropdownMenuItem className={ITEM} onSelect={() => nav("/impulsionar")}><TrendingUp className="h-4 w-4 text-primary" aria-hidden /> Divulgar a casa</DropdownMenuItem>
            {remote && <DropdownMenuItem className={ITEM} onSelect={() => nav("/painel/membros")}><Users className="h-4 w-4 text-primary" aria-hidden /> Membros</DropdownMenuItem>}
            <DropdownMenuItem className={ITEM} onSelect={() => nav("/agenda")}><CalendarDays className="h-4 w-4 text-primary" aria-hidden /> Agenda</DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={() => nav("/planos")}><CreditCard className="h-4 w-4 text-primary" aria-hidden /> Planos e faturas</DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className={ITEM} onSelect={() => void share()}><Link2 className="h-4 w-4 text-primary" aria-hidden /> Compartilhar a página</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

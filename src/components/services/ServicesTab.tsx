import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import ServiceForm from "@/components/services/ServiceForm";
import { createService, deleteService, fetchServices, updateService, type Service } from "@/lib/services";
import { deliveryLabel, formatCents, kindLabel, SERVICE_KINDS, type ServiceValue } from "@/lib/servicesCore";

interface Props {
  /** Id do dono da casa (o mesmo id usado na rota /casa/:id). */
  ownerId: string;
  isOwn: boolean;
  startNew?: boolean;
}

export default function ServicesTab({ ownerId, isOwn, startNew }: Props) {
  const nav = useNavigate();
  const [items, setItems] = useState<Service[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const load = useCallback(async () => setItems(await fetchServices(ownerId)), [ownerId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (startNew && isOwn) {
      setEditing(null);
      setFormOpen(true);
    }
  }, [startNew, isOwn]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const save = async (value: ServiceValue) => {
    const ok = editing ? await updateService(editing.id, value) : Boolean(await createService(ownerId, value));
    if (ok) {
      toast.success(editing ? "Serviço atualizado." : "Serviço adicionado.");
      await load();
    }
    return ok;
  };

  const toggle = async (s: Service) => {
    if (await updateService(s.id, { active: !s.active })) await load();
    else toast.error("Não foi possível alterar.");
  };

  const remove = async (s: Service) => {
    if (!window.confirm(`Excluir “${s.title}”? Essa ação não pode ser desfeita.`)) return;
    if (await deleteService(s.id)) {
      toast.success("Serviço excluído.");
      await load();
    } else toast.error("Não foi possível excluir.");
  };

  if (items === null) return <Card className="p-8 text-center text-muted-foreground">Carregando serviços…</Card>;

  return (
    <div className="space-y-3">
      {isOwn && (
        <div className="flex justify-end">
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo serviço</Button>
        </div>
      )}

      {items.length === 0 && (
        <Card className="p-8 text-center">
          <div className="font-display text-xl mb-1">{isOwn ? "Cadastre o primeiro serviço" : "Esta casa ainda não cadastrou serviços"}</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {isOwn
              ? `Quem visita a sua página vê os serviços com valor e forma de atendimento: ${SERVICE_KINDS.map((k) => k.label.toLowerCase()).join(", ")}.`
              : "Você pode conversar com a casa para saber como ela atende."}
          </p>
          {isOwn && <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4" /> Novo serviço</Button>}
        </Card>
      )}

      {items.map((s) => (
        <Card key={s.id} className={`p-5 ${s.active ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[220px]">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-bold text-xl">{s.title}</h3>
                <Badge tone="gold">{kindLabel(s.kind, s.customKind)}</Badge>
                <Badge tone="muted">{deliveryLabel(s.delivery)}</Badge>
                {!s.active && <Badge tone="muted">Pausado</Badge>}
              </div>
              {s.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{s.description}</p>}
              <p className="text-xs text-muted-foreground mt-2">O pagamento é combinado diretamente com a casa.</p>
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-2xl">{formatCents(s.priceCents)}</div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {isOwn ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(s); setFormOpen(true); }}>Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.active ? "Pausar" : "Ativar"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)}>Excluir</Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => nav(`/mensagens/${ownerId}`)}>Conversar para agendar</Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}

      {isOwn && <ServiceForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSubmit={save} />}
    </div>
  );
}

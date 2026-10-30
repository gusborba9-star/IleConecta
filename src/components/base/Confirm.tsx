import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Modal } from "@/components/base";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação sem volta (apagar, cancelar, devolver dinheiro): o botão de confirmar fica vermelho. */
  danger?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

// Sem o provedor (testes), cai na janela do navegador em vez de não perguntar nada.
const Ctx = createContext<Ask>(async (o) => window.confirm(o.message ? `${o.title}\n${o.message}` : o.title));

/** Pergunta dentro do app, no lugar da janela "OK / Cancelar" do navegador. Devolve true se a pessoa confirmou. */
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((o) => {
    resolver.current?.(false); // uma pergunta nova encerra a anterior
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(o);
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal open={options !== null} onClose={() => finish(false)} title={options?.title} maxWidth="max-w-sm">
        {options?.message && <p className="text-sm text-muted-foreground">{options.message}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={() => finish(false)}>{options?.cancelLabel ?? "Voltar"}</Button>
          <Button variant={options?.danger ? "danger" : "primary"} onClick={() => finish(true)}>{options?.confirmLabel ?? "Confirmar"}</Button>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

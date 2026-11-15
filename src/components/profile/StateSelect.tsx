import { cn } from "@/lib/utils";
import { BR_STATES, ufFromText } from "@/lib/brStates";

type Props = { id?: string; value: string; onChange: (uf: string) => void; className?: string; required?: boolean };

/** Lista de estados: mostra o nome, guarda a sigla. Valor antigo digitado à mão é reconhecido; se não for, aparece "Escolha". */
export default function StateSelect({ id, value, onChange, className, required }: Props) {
  const uf = ufFromText(value);
  return (
    <select
      id={id}
      required={required}
      value={uf}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-full h-11 px-3 rounded-[14px] bg-card border border-input text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent transition", className)}
    >
      <option value="">Escolha o estado</option>
      {BR_STATES.map((s) => (
        <option key={s.uf} value={s.uf}>{s.name}</option>
      ))}
    </select>
  );
}

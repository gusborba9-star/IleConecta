const STEPS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

/**
 * Seletor de horário de 15 em 15 minutos. Substitui o relógio nativo do celular, que em telas com fonte grande
 * sai cortado à direita. Se o valor atual não estiver na lista (horário antigo, como 09:05), ele continua aparecendo.
 */
export default function TimeSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const options = STEPS.includes(value) ? STEPS : [...STEPS, value].sort();
  return (
    <select id={id} className="h-10 w-28 rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

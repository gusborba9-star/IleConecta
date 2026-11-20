export type ToolTone = "verde" | "terra" | "ouro" | "noite";

// Classes escritas por inteiro: o Tailwind só mantém no CSS final as que aparecem assim no código (montar o nome da classe aos pedaços perdia as cores do tema claro).
export const TONE_CLASS: Record<ToolTone, string> = { verde: "tone-verde", terra: "tone-terra", ouro: "tone-ouro", noite: "tone-noite" };

/** Período do dia no horário de Brasília (a plataforma é brasileira, independente do fuso do aparelho). */
export function dayPeriodGreeting(now = new Date()): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(now)) % 24;
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeiro nome de pessoa; para casas, o nome inteiro. */
export function welcomeName(name: string, isHouse: boolean): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (isHouse) return clean;
  const first = clean.split(" ")[0] ?? clean;
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}

// Comparação com o custo de pessoas para o mesmo atendimento (receber, informar e orientar clientes).
// Base: salário médio de assistente de atendimento no Brasil, cerca de R$ 2.000 por mês, sem encargos.
export const AVG_ATTENDANT_SALARY = 2000;
// 24 horas x 7 dias = 168 h por semana; uma pessoa cobre 44 h: cerca de 4 pessoas.
export const PEOPLE_FOR_24H = 4;

/** Custo mensal só de salário de `people` pessoas. */
export function staffCost(people = 1, salary = AVG_ATTENDANT_SALARY) {
  return salary * people;
}

/** Quantas vezes o custo de pessoas supera o plano (inteiro para baixo). Devolve null se não for uma comparação honesta (plano sem preço ou menos de 2x). */
export function staffMultiple(monthly, people = 1, salary = AVG_ATTENDANT_SALARY) {
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  const n = Math.floor(staffCost(people, salary) / monthly);
  return n >= 2 ? n : null;
}

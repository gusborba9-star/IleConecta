import { supabase } from "@/lib/supabase";
import { readHousePeople, readPersonTimeline, type HousePeopleView, type PersonTimeline, type PeopleSegment } from "@/lib/housePeopleCore.js";

const MSG: Record<string, string> = {
  sem_permissao: "Você não tem permissão para ver as pessoas da casa.",
  not_house: "Disponível só para casas e suas equipes.",
  not_related: "Esta pessoa não tem relação com a sua casa.",
  segmento_invalido: "Filtro inválido.",
};
const friendly = (m: string | undefined, fallback: string) => Object.entries(MSG).find(([k]) => (m ?? "").includes(k))?.[1] ?? fallback;

/** Pessoas com relação real com a casa; o banco filtra pela casa e pela permissão de quem pergunta. */
export async function fetchHousePeople(segment: PeopleSegment, search: string, offset: number, limit = 50): Promise<HousePeopleView | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("house_people", { p_segment: segment, p_search: search.trim() || null, p_limit: limit, p_offset: offset });
  if (error) return friendly(error.message, "Não foi possível carregar as pessoas.");
  return readHousePeople(data);
}

export async function fetchPersonTimeline(personId: string): Promise<PersonTimeline | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("house_person_timeline", { p_person: personId, p_limit: 100 });
  if (error) return friendly(error.message, "Não foi possível carregar a linha do tempo.");
  return readPersonTimeline(data) ?? "Não foi possível carregar a linha do tempo.";
}

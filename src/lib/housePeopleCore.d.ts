export type PeopleSegment = "todos" | "seguidor" | "conversou" | "interessado" | "cliente" | "recorrente" | "participante" | "membro" | "pendencia" | "sumido";
export const SEGMENTS: PeopleSegment[];
export const SEGMENT_LABELS: Record<PeopleSegment, string>;
export const SEGMENT_HINTS: Record<PeopleSegment, string>;
export const EVENT_LABELS: Record<string, string>;
export interface HousePerson { personId: string; name: string; avatarUrl: string | null; city: string | null; state: string | null; segments: PeopleSegment[]; purchases: number; spentCents: number | null; firstAt: string | null; lastAt: string | null }
export interface HousePeopleView { role: "titular" | "equipe"; segment: PeopleSegment; total: number; counts: Partial<Record<PeopleSegment, number>>; items: HousePerson[] }
export interface PersonEvent { at: string; kind: string; refId: string | null; title: string; detail: string | null }
export interface PersonTimeline { role: "titular" | "equipe"; person: HousePerson; events: PersonEvent[] }
export function readHousePeople(raw: unknown): HousePeopleView;
export function readPersonTimeline(raw: unknown): PersonTimeline | null;
export function agoText(iso: string | null | undefined, now?: Date): string;
export function eventDetailText(kind: string, detail: string | null | undefined): string;
export function eventTarget(kind: string, role: "titular" | "equipe"): string | null;

export type VideoKind = "reuniao" | "consulta" | "atividade";
export type VideoRole = "dono" | "coanfitriao" | "moderador" | "participante";
export type VideoState = "off" | "beta" | "on";
export type VideoProvider = "daily" | "livekit";
export interface VideoConfig { state: VideoState; provider: VideoProvider; beta_houses: string[] }
export interface BankView { cap: number; used: number; remaining: number; pct: number; level: "ok" | "warn" | "out" }
export const KINDS: Record<VideoKind, string>;
export const ROLE_LABEL: Record<VideoRole, string>;
export const VIDEO_STATES: VideoState[];
export const VIDEO_PROVIDERS: VideoProvider[];
export const VIDEO_STATE_LABEL: Record<VideoState, string>;
export const PROVIDER_LABEL: Record<VideoProvider, string>;
export function formatWhen(iso: string): string;
export function joinReasonText(reason: string | undefined, startsAt?: string | null): string;
export function meetingPhase(m: { starts_at?: string; startsAt?: string; duration_min?: number; durationMin?: number }, nowMs?: number): "cedo" | "aberta" | "encerrada";
export function bankView(b: { cap?: number; used?: number; remaining?: number } | null | undefined): BankView;
export function localToIso(date: string, time: string): string | null;
export function validateSchedule(i: { kind: string; title: string; startsAtIso: string | null; duration: number | string; max?: number | string; orderId?: string | null; audience?: "todos" | "escolher"; invitees?: string[] }, nowMs?: number): string | null;
export function embedUrl(provider: string, url: string, token?: string | null): string | null;
export function readVideoConfig(raw: unknown): VideoConfig;
export function livekitServerUrl(url: string): string | null;
export function homeMeetingCards<T extends { startsAt?: string; starts_at?: string; durationMin?: number; duration_min?: number }>(list: T[] | null | undefined, nowMs?: number): (T & { start: number; state: "aberta" | "hoje" | "amanha" })[];
export interface PresenceLike { name: string; role: VideoRole; expected: boolean; firstIn: string | null; lastOut: string | null; minutes: number; sessions: number; removed: boolean }
export function presenceCsv(rows: PresenceLike[]): string;
export function presenceSummary(rows: PresenceLike[]): { expected: number; present: number; absent: number; minutes: number };

export type VideoKind = "reuniao" | "consulta";
export type VideoState = "off" | "beta" | "on";
export type VideoProvider = "daily" | "whereby";
export interface VideoConfig { state: VideoState; provider: VideoProvider; beta_houses: string[] }
export interface BankView { cap: number; used: number; remaining: number; pct: number; level: "ok" | "warn" | "out" }
export const KINDS: Record<VideoKind, string>;
export const VIDEO_STATES: VideoState[];
export const VIDEO_PROVIDERS: VideoProvider[];
export const VIDEO_STATE_LABEL: Record<VideoState, string>;
export const PROVIDER_LABEL: Record<VideoProvider, string>;
export function formatWhen(iso: string): string;
export function joinReasonText(reason: string | undefined, startsAt?: string | null): string;
export function meetingPhase(m: { starts_at?: string; startsAt?: string; duration_min?: number; durationMin?: number }, nowMs?: number): "cedo" | "aberta" | "encerrada";
export function bankView(b: { cap?: number; used?: number; remaining?: number } | null | undefined): BankView;
export function localToIso(date: string, time: string): string | null;
export function validateSchedule(i: { kind: string; title: string; startsAtIso: string | null; duration: number | string; max?: number | string; orderId?: string | null }, nowMs?: number): string | null;
export function embedUrl(provider: string, url: string, token?: string | null): string | null;
export function readVideoConfig(raw: unknown): VideoConfig;

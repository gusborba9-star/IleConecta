export interface Counts { erro_app: number; ia_falha: number; funcao_erro: number }
export interface TopError { kind: string; source: string; route: string | null; detail: string; n: number; firstAt: string | null; lastAt: string | null }
export interface CronRow { name: string; schedule: string; active: boolean; lastRun: string | null; lastStatus: string | null; runs24: number; failed24: number; failed30: number }
export interface Health { generatedAt: string | null; lastHour: Counts; last24h: Counts; top: TopError[]; cron: CronRow[]; db: { sizeBytes: number; connections: number }; alerts: { code: string; since: string | null }[] }
export const KIND_LABELS: Record<string, string>;
export function readHealth(raw: unknown): Health;
export function overallStatus(h: Health): "ok" | "observar" | "atencao";
export const STATUS_TEXT: Record<string, string>;
export function cronState(c: CronRow, now?: number): "ok" | "falhando" | "parada" | "desligada" | "ainda_nao_rodou" | "falhou_antes";
export const CRON_STATE_TEXT: Record<string, string>;
export function ago(iso: string | null | undefined, now?: number): string;
export function megabytes(b: number): string;
export const CRON_DESCRIPTIONS: Record<string, string>;
export function cronDescription(name: string): string;
export function cronWhen(schedule: string): string;

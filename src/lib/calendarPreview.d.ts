import type { Visibility, VisKey } from "./calendarCore";
export interface PreviewItem extends Partial<Visibility> { title: string; date: string; yearly: boolean; note?: string | null; time?: string | null }
export interface PreviewRow { key: VisKey; label: string; on: boolean; text: string; off: string }
export function whenText(item: { date: string; yearly: boolean; time?: string | null }, today: string): string;
export function assistantExample(item: { title: string; date: string; yearly: boolean; note?: string | null; time?: string | null }, today: string): string;
export function previewRows(item: PreviewItem & Visibility, today: string): PreviewRow[];

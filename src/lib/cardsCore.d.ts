export type SegmentId = "ritual" | "jogo" | "servico" | "trabalho";
export interface Segment { label: string; bg: string; border: string; accent: string; glow: string }
export declare const SEGMENTS: Record<SegmentId, Segment>;
export function serviceSegment(s: { bookable?: boolean; kind?: string } | null | undefined): SegmentId;
export function timeLabel(iso: string): string;
export function slotChipLabel(iso: string, now?: Date): string;
export function dateTile(iso: string): { month: string; day: string; when: string };
export function primaryLabel(segment: SegmentId, slotIso?: string | null): string;
export function cardHint(segment: SegmentId, payOn: boolean, noButton?: boolean): string;
export function chatStatus(a: { online: boolean; hasAssistant: boolean }): string;
export declare const AFTER_PAYMENT: string;

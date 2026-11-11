export type HandoffState = "automacao" | "pendente" | "humano";
export interface Handoff { state: HandoffState; active: boolean; handlerName: string | null }
export interface HandoffViewModel { tone: "alert" | "info"; text: string; action: "take" | "release" | null; label: string }
export declare function toHandoff(row: unknown): Handoff;
export declare function handoffView(h: Handoff | null | undefined, viewer: "house" | "client", opts?: { always?: boolean }): HandoffViewModel | null;
export declare function shouldCallAssistant(args: { houseOffline: boolean; hasAssistant: boolean; handoff?: Handoff | null }): boolean;

import type { CardMode } from "@/lib/postCardCore";
import type { PreparedCardImage } from "@/lib/postImages";

export interface StyleDraft { mode: CardMode; image: PreparedCardImage | null; ack: boolean }
export const EMPTY_STYLE: StyleDraft = { mode: "normal", image: null, ack: false };

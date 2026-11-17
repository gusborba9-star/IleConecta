import type { CardMode } from "@/lib/postCardCore";
import { EMPTY_LETTERS, type Letters } from "@/lib/postLettersCore";
import type { PreparedCardImage } from "@/lib/postImages";

export interface StyleDraft { mode: CardMode; image: PreparedCardImage | null; ack: boolean; letters: Letters }
export const EMPTY_STYLE: StyleDraft = { mode: "normal", image: null, ack: false, letters: EMPTY_LETTERS };

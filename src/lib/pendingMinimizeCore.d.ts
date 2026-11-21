interface Item { kind: string; refId?: string; priority?: string; overdue?: boolean }
export function canMinimize(item: Item, opts?: { hasCredits?: boolean }): boolean;
export function minimizeKey(item: Item): string;
export function shownPriority(item: Item, opts?: { hasCredits?: boolean }): "alta" | "normal";
export function readMinimized(userId: string, storage?: Pick<Storage, "getItem">): Set<string>;
export function writeMinimized(userId: string, keys: Iterable<string>, alive: Iterable<string>, storage?: Pick<Storage, "setItem">): void;

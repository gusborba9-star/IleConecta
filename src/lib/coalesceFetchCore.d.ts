export const READ_RPCS: Set<string>;
export function isCoalescible(method: string | undefined, url: string): boolean;
export function createCoalescingFetch(baseFetch: typeof fetch): typeof fetch;

export interface ReachSets { mine: Set<string>; highlight: Set<string>; boosted: Set<string> }
export function reachSets(a?: { follows?: string[]; bonds?: string[]; highlightOwners?: string[]; boostedItemIds?: string[] }): ReachSets;
export function canSee(a: { viewerId?: string | null; ownerId?: string | null; itemId?: string | null }, sets: ReachSets): boolean;
